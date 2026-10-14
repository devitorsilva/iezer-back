import type { Prisma, TeamRole } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { runAudited, type AuditActor, type AuditWriter } from "../../../lib/audit.js";
import { AppError } from "../../../lib/errors.js";
import { trySendMail } from "../../../lib/mailer.js";
import { assertValidNewPassword } from "../../../lib/password-rules.js";
import { prisma } from "../../../lib/prisma.js";
import { TEAM_ROLE_LABELS } from "../../../lib/team.js";
import {
  TEAM_INVITE_TTL_MS,
  teamAuthenticatorResetNotice,
  teamInviteEmail,
  teamInviteUrl,
} from "../../../lib/team-emails.js";
import { TEAM_TERMS_VERSION } from "../../../lib/terms.js";
import { generateToken, hashToken } from "../../../lib/tokens.js";
import type { TeamInviteWithRelations, TeamMemberWithUser, TeamRepository } from "./repository.js";
import type { AcceptTeamInviteInput, CreateTeamInviteInput } from "./schemas.js";

type Db = Prisma.TransactionClient;

export class TeamNotFoundError extends Error {
  constructor(readonly target: "member" | "invite") {
    super("TEAM_NOT_FOUND");
  }
}

export interface TeamActionContext {
  actor: AuditActor;
  // Quem age: null no script de bootstrap (sistema).
  userId: string | null;
  userName: string | null;
}

export type TeamMemberStatus = "CONVIDADO" | "ATIVO" | "DESATIVADO" | "CANCELADO";

const TEAM_INVITE_INVALID_MESSAGE = "Este convite é inválido, já foi usado ou expirou. Peça um novo a um Administrador iEzer.";

// Trava da equipe: escritas que mexem em papéis ou status passam uma de cada vez.
const TEAM_LOCK_KEY = "iezer-team";

const rolesText = (roles: readonly TeamRole[]) => roles.map((role) => TEAM_ROLE_LABELS[role]).join(", ");

function mapMember(member: TeamMemberWithUser) {
  return {
    id: member.id,
    kind: "MEMBRO" as const,
    userId: member.user.id,
    name: member.user.name,
    email: member.user.email,
    roles: member.roles,
    status: (member.user.status === "ATIVO" ? "ATIVO" : "DESATIVADO") satisfies TeamMemberStatus,
    // Equipe só conta o app autenticador (B2).
    twoFactorEnabled: member.user.twoFactorEnabled && member.user.twoFactors.length > 0,
    lastLoginAt: member.user.lastLoginAt?.toISOString() ?? null,
    invitedByName: member.invitedBy?.name ?? null,
    inviteExpiresAt: null,
    createdAt: member.createdAt.toISOString(),
  };
}

function mapInvite(invite: TeamInviteWithRelations) {
  return {
    id: invite.id,
    kind: "CONVITE" as const,
    userId: null,
    name: invite.name,
    email: invite.email,
    roles: invite.roles,
    // A lista só traz pendentes; o cancelado volta assim na resposta do cancelamento.
    status: (invite.status === "PENDENTE" ? "CONVIDADO" : "CANCELADO") satisfies TeamMemberStatus,
    twoFactorEnabled: false,
    lastLoginAt: null,
    invitedByName: invite.invitedBy?.name ?? null,
    inviteExpiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
  };
}

// Equipe iEzer (RF-BO03, RF-BO06 a RF-BO10). Ações sem igreja: AuditLog com organização nula e
// módulo BACKOFFICE, só na auditoria interna (RT-BB12).
export class TeamService {
  constructor(private readonly repository: TeamRepository) {}

  async list() {
    const [members, invites] = await Promise.all([this.repository.findMembers(), this.repository.findPendingInvites()]);
    const collator = new Intl.Collator("pt-BR");

    return [...members.map(mapMember), ...invites.map(mapInvite)].sort((a, b) => collator.compare(a.name, b.name));
  }

  // Convite (RF-BO07): 72h, uso único. O e-mail não pode ser de usuário de igreja.
  async invite(context: TeamActionContext, input: CreateTeamInviteInput) {
    const { token, tokenHash } = generateToken();

    const invite = await runAudited(context.actor, async (tx, audit) => {
      await this.assertEmailAvailable(tx, input.email);
      await this.repository.cancelExpiredInvites(input.email, tx);

      const created = await this.repository.createInvite(
        {
          email: input.email,
          name: input.name,
          roles: input.roles,
          tokenHash,
          expiresAt: new Date(Date.now() + TEAM_INVITE_TTL_MS),
          invitedById: context.userId,
        },
        tx,
      );

      await audit({
        organizationId: null,
        module: "BACKOFFICE",
        action: "convidar_equipe",
        targetType: "TeamInvite",
        targetId: created.id,
        after: { name: input.name, email: input.email, roles: input.roles },
      });
      return created;
    });

    const emailSent = await this.sendInviteEmail(invite, token);
    return { invite: mapInvite(invite), link: teamInviteUrl(token), emailSent };
  }

  // Reenviar troca o token (o link anterior deixa de valer) e renova as 72h.
  async resendInvite(context: TeamActionContext, id: string, sendEmail: boolean) {
    const { token, tokenHash } = generateToken();

    const invite = await runAudited(context.actor, async (tx, audit) => {
      const current = await this.findPendingInviteOrThrow(id, tx);
      const updated = await this.repository.updateInvite(
        id,
        { tokenHash, expiresAt: new Date(Date.now() + TEAM_INVITE_TTL_MS) },
        tx,
      );

      await audit({
        organizationId: null,
        module: "BACKOFFICE",
        action: "reenviar_convite_equipe",
        targetType: "TeamInvite",
        targetId: id,
        before: { expiresAt: current.expiresAt },
        after: { expiresAt: updated.expiresAt, sendEmail },
      });
      return updated;
    });

    const emailSent = sendEmail ? await this.sendInviteEmail(invite, token) : false;
    return { invite: mapInvite(invite), link: teamInviteUrl(token), emailSent };
  }

  async cancelInvite(context: TeamActionContext, id: string) {
    const invite = await runAudited(context.actor, async (tx, audit) => {
      await this.findPendingInviteOrThrow(id, tx);
      const updated = await this.repository.updateInvite(id, { status: "CANCELADO", canceledAt: new Date() }, tx);

      await audit({
        organizationId: null,
        module: "BACKOFFICE",
        action: "cancelar_convite_equipe",
        targetType: "TeamInvite",
        targetId: id,
        before: { status: "PENDENTE" },
        after: { status: "CANCELADO" },
      });
      return updated;
    });

    return mapInvite(invite);
  }

  // Mudar papéis (RF-BO08), com as travas do RF-BO10.
  async changeRoles(context: TeamActionContext, id: string, roles: TeamRole[]) {
    await this.runGuarded(context, async (tx, audit) => {
      const member = await this.findMemberOrThrow(id, tx);
      this.assertNotSelf(context, member, "Você não pode mudar os seus próprios papéis.");

      await this.repository.updateRoles(id, roles, tx);
      await audit({
        organizationId: null,
        module: "BACKOFFICE",
        action: "alterar_papeis_equipe",
        targetType: "TeamMember",
        targetId: id,
        description: `${member.user.name}: ${rolesText(member.roles)} → ${rolesText(roles)}`,
        before: { roles: member.roles },
        after: { roles },
      });
    });

    return this.memberDto(id);
  }

  // Desativar derruba as sessões na hora (RF-BO08). O status é o do User: o login e o
  // requireSession já recusam quem não está ATIVO.
  async deactivate(context: TeamActionContext, id: string) {
    await this.runGuarded(context, async (tx, audit) => {
      const member = await this.findMemberOrThrow(id, tx);
      this.assertNotSelf(context, member, "Você não pode desativar a sua própria conta.");

      if (member.user.status !== "ATIVO") {
        throw new AppError(409, "TEAM_ALREADY_INACTIVE", "Este membro já está desativado.");
      }

      await tx.user.update({ where: { id: member.user.id }, data: { status: "DESATIVADO" } });
      await tx.session.deleteMany({ where: { userId: member.user.id } });
      await audit({
        organizationId: null,
        module: "BACKOFFICE",
        action: "desativar_equipe",
        targetType: "TeamMember",
        targetId: id,
        description: member.user.name,
        before: { status: "ATIVO" },
        after: { status: "DESATIVADO" },
      });
    });

    return this.memberDto(id);
  }

  async reactivate(context: TeamActionContext, id: string) {
    await this.runGuarded(context, async (tx, audit) => {
      const member = await this.findMemberOrThrow(id, tx);

      if (member.user.status === "ATIVO") {
        throw new AppError(409, "TEAM_ALREADY_ACTIVE", "Este membro já está ativo.");
      }

      await tx.user.update({ where: { id: member.user.id }, data: { status: "ATIVO" } });
      await audit({
        organizationId: null,
        module: "BACKOFFICE",
        action: "reativar_equipe",
        targetType: "TeamMember",
        targetId: id,
        description: member.user.name,
        before: { status: member.user.status },
        after: { status: "ATIVO" },
      });
    });

    return this.memberDto(id);
  }

  // Redefinir o app autenticador (RF-BO09): apaga o segredo e os códigos, derruba as sessões; o
  // membro configura de novo no próximo login e recebe e-mail.
  async resetAuthenticator(context: TeamActionContext, id: string) {
    const member = await runAudited(context.actor, async (tx, audit) => {
      const member = await this.findMemberOrThrow(id, tx);

      await tx.twoFactor.deleteMany({ where: { userId: member.user.id } });
      await tx.user.update({ where: { id: member.user.id }, data: { twoFactorEnabled: false } });
      await tx.session.deleteMany({ where: { userId: member.user.id } });
      await audit({
        organizationId: null,
        module: "BACKOFFICE",
        action: "redefinir_autenticador_equipe",
        targetType: "TeamMember",
        targetId: id,
        description: member.user.name,
        before: { twoFactorEnabled: member.user.twoFactorEnabled },
        after: { twoFactorEnabled: false },
      });
      return member;
    });

    await trySendMail(
      teamAuthenticatorResetNotice({
        to: member.user.email,
        name: member.user.name,
        byName: context.userName ?? "Um Administrador iEzer",
      }),
    );
    return this.memberDto(id);
  }

  // Página pública do convite (RF-BO03).
  async peek(token: string) {
    const invite = this.assertUsable(await this.repository.findInviteByTokenHash(hashToken(token)));

    return {
      name: invite.name,
      email: invite.email,
      roles: invite.roles,
      inviterName: invite.invitedBy?.name ?? null,
      expiresAt: invite.expiresAt.toISOString(),
      termsVersion: TEAM_TERMS_VERSION,
    };
  }

  // Aceite (RF-BO03): conta sem pessoa (RT-BB02), senha, membro com os papéis e o termo numa
  // transação. O app autenticador e os códigos de recuperação vêm depois, na sessão restrita.
  async accept(token: string, input: AcceptTeamInviteInput, meta: { ip: string | null; userAgent: string | null }) {
    const invite = this.assertUsable(await this.repository.findInviteByTokenHash(hashToken(token)));

    await assertValidNewPassword(input.password, { email: invite.email });
    const passwordHash = await hashPassword(input.password);

    // O autor do log é o próprio membro, que só ganha id dentro da transação.
    const actor: AuditActor = { type: "SUPORTE", userId: null, ip: meta.ip, userAgent: meta.userAgent };

    return runAudited(actor, async (tx, audit) => {
      if (!(await this.repository.consumeInvite(invite.id, tx))) {
        throw new AppError(404, "TEAM_INVITE_INVALID", TEAM_INVITE_INVALID_MESSAGE);
      }

      if (await tx.user.findUnique({ where: { email: invite.email }, select: { id: true } })) {
        throw new AppError(409, "EMAIL_IN_USE", "Já existe um acesso com este e-mail. Fale com um Administrador iEzer.");
      }
      await this.assertNoChurchInvite(tx, invite.email);

      const now = new Date();
      const user = await tx.user.create({
        data: { email: invite.email, name: invite.name, emailVerified: true, status: "ATIVO" },
      });
      await tx.account.create({
        data: { userId: user.id, accountId: user.id, providerId: "credential", password: passwordHash },
      });
      const member = await tx.teamMember.create({
        data: {
          userId: user.id,
          roles: invite.roles,
          invitedById: invite.invitedById,
          termsVersion: TEAM_TERMS_VERSION,
          termsAcceptedAt: now,
        },
      });
      await tx.teamInvite.update({ where: { id: invite.id }, data: { acceptedUserId: user.id } });

      actor.userId = user.id;
      await audit([
        {
          organizationId: null,
          module: "BACKOFFICE",
          action: "aceitar_convite_equipe",
          targetType: "TeamMember",
          targetId: member.id,
          after: { email: invite.email, roles: invite.roles },
        },
        {
          organizationId: null,
          module: "BACKOFFICE",
          action: "aceitar_termo_equipe",
          targetType: "TeamMember",
          targetId: member.id,
          after: { termsVersion: TEAM_TERMS_VERSION, acceptedAt: now },
        },
      ]);

      return { email: user.email };
    });
  }

  // Novo aceite do termo quando a versão muda (o primeiro vem no convite).
  async acceptTerms(context: TeamActionContext, memberId: string) {
    return runAudited(context.actor, async (tx, audit) => {
      const acceptedAt = new Date();
      await tx.teamMember.update({
        where: { id: memberId },
        data: { termsVersion: TEAM_TERMS_VERSION, termsAcceptedAt: acceptedAt },
      });
      await audit({
        organizationId: null,
        module: "BACKOFFICE",
        action: "aceitar_termo_equipe",
        targetType: "TeamMember",
        targetId: memberId,
        after: { termsVersion: TEAM_TERMS_VERSION, acceptedAt },
      });
      return { version: TEAM_TERMS_VERSION, accepted: true };
    });
  }

  // Contas exclusivas (Segurança da equipe): nada de usuário de igreja nem de convite de igreja
  // válido; um convite da equipe pendente por e-mail.
  async assertEmailAvailable(db: Db, email: string) {
    const user = await db.user.findUnique({ where: { email }, select: { teamMember: { select: { id: true } } } });

    if (user?.teamMember) {
      throw new AppError(409, "TEAM_MEMBER_EXISTS", "Este e-mail já é de um membro da equipe.", { field: "email" });
    }
    if (user) {
      throw new AppError(409, "CHURCH_USER_EMAIL", "Este e-mail é de um usuário de igreja. Use outro e-mail para a equipe.", {
        field: "email",
      });
    }

    await this.assertNoChurchInvite(db, email);

    const pending = await db.teamInvite.findFirst({
      where: { email, status: "PENDENTE", expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (pending) {
      throw new AppError(409, "TEAM_INVITE_PENDING", 'Já existe um convite pendente para este e-mail. Use "Reenviar".', {
        field: "email",
      });
    }
  }

  private async assertNoChurchInvite(db: Db, email: string) {
    const churchInvite = await db.invite.findFirst({
      where: { email, status: "PENDENTE", expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (churchInvite) {
      throw new AppError(409, "CHURCH_USER_EMAIL", "Este e-mail tem um convite de igreja pendente. Use outro e-mail para a equipe.", {
        field: "email",
      });
    }
  }

  // Travas do RF-BO10 numa transação só, uma escrita de cada vez: nunca fica sem Administrador
  // iEzer ativo.
  private runGuarded(context: TeamActionContext, fn: (tx: Db, audit: AuditWriter) => Promise<void>) {
    return runAudited(context.actor, async (tx, audit) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${TEAM_LOCK_KEY}))`;
      await fn(tx, audit);

      if ((await this.repository.countActiveAdmins(tx)) === 0) {
        throw new AppError(409, "TEAM_LAST_ADMIN", "A equipe precisa de pelo menos um Administrador iEzer ativo.");
      }
    });
  }

  private assertNotSelf(context: TeamActionContext, member: TeamMemberWithUser, message: string) {
    if (context.userId && member.user.id === context.userId) {
      throw new AppError(409, "TEAM_SELF_CHANGE", message);
    }
  }

  private async findMemberOrThrow(id: string, db: Db) {
    const member = await this.repository.findMember(id, db);
    if (!member) throw new TeamNotFoundError("member");
    return member;
  }

  private async findPendingInviteOrThrow(id: string, db: Db) {
    const invite = await this.repository.findInvite(id, db);
    if (!invite) throw new TeamNotFoundError("invite");
    if (invite.status !== "PENDENTE") {
      throw new AppError(409, "TEAM_INVITE_NOT_PENDING", "Este convite já foi aceito ou cancelado.");
    }
    return invite;
  }

  private assertUsable(invite: TeamInviteWithRelations | null) {
    if (!invite || invite.status !== "PENDENTE" || invite.expiresAt <= new Date()) {
      throw new AppError(404, "TEAM_INVITE_INVALID", TEAM_INVITE_INVALID_MESSAGE);
    }
    return invite;
  }

  private async memberDto(id: string) {
    const member = await this.repository.findMember(id, prisma);
    if (!member) throw new TeamNotFoundError("member");
    return mapMember(member);
  }

  private sendInviteEmail(invite: TeamInviteWithRelations, token: string) {
    return trySendMail(
      teamInviteEmail({
        to: invite.email,
        name: invite.name,
        roles: invite.roles,
        inviterName: invite.invitedBy?.name ?? null,
        token,
      }),
    );
  }
}
