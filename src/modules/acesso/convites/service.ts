import type { Prisma } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import type { AccessibleOrganization } from "../../../lib/access.js";
import { runAudited, type AuditActor, type AuditWriter } from "../../../lib/audit.js";
import { findUserChurch } from "../../../lib/church.js";
import { INVITE_TTL_MS, inviteEmail, inviteUrl } from "../../../lib/emails.js";
import { AppError } from "../../../lib/errors.js";
import { trySendMail } from "../../../lib/mailer.js";
import { prisma } from "../../../lib/prisma.js";
import { assertValidNewPassword } from "../../../lib/password-rules.js";
import { isTeamEmail, teamEmailError } from "../../../lib/team.js";
import { TERMS_VERSION } from "../../../lib/terms.js";
import { generateToken, hashToken } from "../../../lib/tokens.js";
import { summarizePermissions } from "../permissoes/catalog/index.js";
import { assertCanChangeAssignments, runGuarded } from "../travas.js";
import type { InviteRepository, InviteWithRelations } from "./repository.js";
import type { AcceptInviteInput, ChangeEmailInput, CreateInviteInput } from "./schemas.js";

type Db = Prisma.TransactionClient;

export class InviteNotFoundError extends Error {
  constructor() {
    super("INVITE_NOT_FOUND");
  }
}

export interface InviteContext {
  churchId: string;
  actor: AuditActor;
  // Organizações que quem convida alcança, com as permissões efetivas.
  // null: sistema (script de criação da igreja), sem travas de quem concede.
  organizations: AccessibleOrganization[] | null;
}

const INVITE_INVALID_MESSAGE = "Este convite não é mais válido. Peça um novo ao administrador da sua igreja.";

// Convite feito pela equipe iEzer (criação da igreja, recuperação de admin): a igreja vê a equipe,
// não o nome de quem atendeu.
const inviterName = (invite: Pick<InviteWithRelations, "invitedBy">) =>
  invite.invitedBy?.teamMember ? "Equipe iEzer" : (invite.invitedBy?.name ?? null);

function inviteStatus(invite: Pick<InviteWithRelations, "status" | "expiresAt">) {
  return invite.status === "PENDENTE" && invite.expiresAt <= new Date() ? "EXPIRADO" : invite.status;
}

function mapInvite(invite: InviteWithRelations) {
  return {
    id: invite.id,
    personId: invite.person.id,
    personName: invite.person.name,
    email: invite.email,
    status: inviteStatus(invite),
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
    invitedByName: inviterName(invite),
    assignments: invite.assignments.map(({ organization, profile }) => ({
      organizationId: organization.id,
      organizationName: organization.name,
      profileId: profile.id,
      profileName: profile.name,
    })),
  };
}

export type InviteDto = ReturnType<typeof mapInvite>;

// Organizações com os perfis de cada uma, sede primeiro.
function groupAssignments(invite: InviteWithRelations) {
  const groups = new Map<string, { organizationName: string; isSede: boolean; profiles: string[] }>();

  for (const { organization, profile } of invite.assignments) {
    const group = groups.get(organization.id) ?? {
      organizationName: organization.name,
      isSede: organization.type === "SEDE",
      profiles: [],
    };
    group.profiles.push(profile.name);
    groups.set(organization.id, group);
  }

  return [...groups.values()]
    .sort((a, b) => Number(b.isSede) - Number(a.isSede) || a.organizationName.localeCompare(b.organizationName, "pt-BR"))
    .map(({ organizationName, profiles }) => ({ organizationName, profiles }));
}

function otherChurchError() {
  return new AppError(
    409,
    "EMAIL_IN_OTHER_CHURCH",
    "Este e-mail já tem acesso a outra igreja no iEzer. Por enquanto, cada e-mail entra em uma igreja só: use outro e-mail para esta pessoa.",
  );
}

// E-mail de login é único no iEzer (RF-CV08). Convites pendentes já expirados do mesmo
// e-mail (ou pessoa) são cancelados; os válidos bloqueiam. Devolve os ids cancelados.
export async function assertLoginEmailAvailable(
  db: Db,
  email: string,
  churchId: string,
  options: { personId?: string; ignoreInviteId?: string } = {},
) {
  if (await isTeamEmail(email, db)) throw teamEmailError();

  const user = await db.user.findUnique({ where: { email }, select: { id: true } });

  if (user) {
    const church = await findUserChurch(user.id, db);
    if (church && church.id !== churchId) throw otherChurchError();
    throw new AppError(409, "USER_EXISTS", "Este e-mail já é de um usuário do iEzer. Gerencie o acesso em Usuários.");
  }

  const pending = await db.invite.findMany({
    where: {
      status: "PENDENTE",
      id: options.ignoreInviteId ? { not: options.ignoreInviteId } : undefined,
      OR: [{ email }, ...(options.personId ? [{ personId: options.personId }] : [])],
    },
    select: { id: true, churchId: true, expiresAt: true },
  });
  const active = pending.find((invite) => invite.expiresAt > new Date());

  if (active) {
    if (active.churchId !== churchId) throw otherChurchError();
    throw new AppError(
      409,
      "INVITE_PENDING",
      "Já existe um convite pendente para esta pessoa ou e-mail. Use \"Reenviar\" na lista de convites.",
    );
  }

  const expiredIds = pending.map((invite) => invite.id);
  if (expiredIds.length) {
    await db.invite.updateMany({
      where: { id: { in: expiredIds }, status: "PENDENTE" },
      data: { status: "CANCELADO", canceledAt: new Date() },
    });
  }
  return expiredIds;
}

// Atribuições do convite para quem o aceitou, por senha ou pelo Google. Devolve o registro do log.
async function grantInvite(tx: Db, invite: InviteWithRelations, userId: string, method: "senha" | "google" = "senha") {
  const assignments = invite.assignments.map(({ organization, profile }) => ({
    organizationId: organization.id,
    profileId: profile.id,
  }));

  await tx.userAssignment.createMany({
    data: assignments.map((item) => ({ ...item, userId })),
    skipDuplicates: true,
  });
  await tx.invite.update({ where: { id: invite.id }, data: { acceptedUserId: userId } });

  return {
    organizationId: invite.church.id,
    module: "ACESSO" as const,
    action: "aceitar_convite",
    targetType: "Invite",
    targetId: invite.id,
    after: { userId, method, assignments },
  };
}

export class InviteService {
  constructor(private readonly repository: InviteRepository) {}

  async list(churchId: string, organizationIds: string[]) {
    const invites = await this.repository.findPending(churchId, organizationIds);
    return invites.map(mapInvite);
  }

  // Aba Acesso do perfil da pessoa (RF-US06).
  async findForPerson(churchId: string, organizationIds: string[], personId: string) {
    const [invite] = await this.repository.findPending(churchId, organizationIds, personId);
    return invite ? mapInvite(invite) : null;
  }

  // Dar acesso (RF-CV01 a RF-CV03, RF-CV08).
  async create(context: InviteContext, input: CreateInviteInput) {
    const { invite, token } = await runAudited(context.actor, (tx, audit) =>
      this.createInTx(tx, audit, context, input),
    );

    const emailSent = await this.sendInviteEmail(invite, token);
    return { invite: mapInvite(invite), link: inviteUrl(token), emailSent };
  }

  // Convite dentro de uma transação maior (criação da igreja pelo back-office). Quem chama envia o
  // e-mail depois do commit, com sendCreatedInvite.
  async createInTx(tx: Db, audit: AuditWriter, context: InviteContext, input: CreateInviteInput) {
    const assignments = input.assignments.flatMap(({ organizationId, profileIds }) =>
      [...new Set(profileIds)].map((profileId) => ({ organizationId, profileId })),
    );
    const { token, tokenHash } = generateToken();

    const person = await tx.person.findFirst({
      where: { id: input.personId, organization: { OR: [{ id: context.churchId }, { parentId: context.churchId }] } },
      select: { id: true, name: true, email: true, user: { select: { id: true } } },
    });

    if (!person) throw new AppError(400, "INVALID_PERSON", "Pessoa não encontrada nesta igreja.");

    if (person.user) {
      throw new AppError(409, "PERSON_HAS_USER", `${person.name} já tem acesso ao iEzer. Gerencie os perfis em Usuários.`);
    }

    if (!person.email) {
      throw new AppError(
        400,
        "PERSON_EMAIL_REQUIRED",
        "Para dar acesso, a pessoa precisa ter e-mail. Cadastre o e-mail no perfil dela.",
      );
    }

    const email = person.email.toLowerCase();
    await assertCanChangeAssignments(tx, context.churchId, context.organizations, assignments);
    const canceled = await assertLoginEmailAvailable(tx, email, context.churchId, { personId: person.id });

    const invite = await this.repository.create(
      {
        churchId: context.churchId,
        personId: person.id,
        email,
        tokenHash,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedByUserId: context.actor.userId,
        assignments,
      },
      tx,
    );

    await audit({
      organizationId: context.churchId,
      module: "ACESSO",
      action: "criar_convite",
      targetType: "Invite",
      targetId: invite.id,
      description: canceled.length ? `Substitui convite(s) expirado(s): ${canceled.join(", ")}` : undefined,
      after: mapInvite(invite),
    });

    return { invite, token };
  }

  async sendCreatedInvite(created: { invite: InviteWithRelations; token: string }) {
    const emailSent = await this.sendInviteEmail(created.invite, created.token);
    return { invite: mapInvite(created.invite), link: inviteUrl(created.token), emailSent };
  }

  // Reenviar invalida o link anterior (RF-CV04); sem e-mail, só gera o link para copiar.
  // options.action/description: o reenvio pelo back-office grava a própria ação, com motivo (RF-BO32).
  async resend(
    context: InviteContext,
    id: string,
    sendEmail: boolean,
    options: { action?: string; description?: string } = {},
  ) {
    const { token, tokenHash } = generateToken();

    const invite = await runAudited(context.actor, async (tx, audit) => {
      const current = await this.findPendingOrThrow(id, context.churchId, tx);
      const updated = await this.repository.update(
        id,
        { tokenHash, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
        tx,
      );

      await audit({
        organizationId: context.churchId,
        module: "ACESSO",
        action: options.action ?? (sendEmail ? "reenviar_convite" : "gerar_link_convite"),
        targetType: "Invite",
        targetId: id,
        description: options.description,
        before: { expiresAt: current.expiresAt },
        after: { expiresAt: updated.expiresAt },
      });

      return updated;
    });

    const emailSent = sendEmail ? await this.sendInviteEmail(invite, token) : false;
    return { invite: mapInvite(invite), link: inviteUrl(token), emailSent };
  }

  async cancel(context: InviteContext, id: string) {
    return runAudited(context.actor, async (tx, audit) => {
      const current = await this.findPendingOrThrow(id, context.churchId, tx);
      const updated = await this.repository.update(id, { status: "CANCELADO", canceledAt: new Date() }, tx);

      await audit({
        organizationId: context.churchId,
        module: "ACESSO",
        action: "cancelar_convite",
        targetType: "Invite",
        targetId: id,
        before: mapInvite(current),
        after: mapInvite(updated),
      });

      return mapInvite(updated);
    });
  }

  // Troca o e-mail da pessoa e reenvia o convite para o novo endereço (RF-RS04).
  async changeEmail(context: InviteContext, id: string, input: ChangeEmailInput) {
    const { token, tokenHash } = generateToken();

    const invite = await runAudited(context.actor, async (tx, audit) => {
      const current = await this.findPendingOrThrow(id, context.churchId, tx);

      if (input.email !== current.email) {
        await assertLoginEmailAvailable(tx, input.email, context.churchId, {
          personId: current.personId,
          ignoreInviteId: current.id,
        });
      }

      await tx.person.update({ where: { id: current.personId }, data: { email: input.email } });
      const updated = await this.repository.update(
        id,
        { email: input.email, tokenHash, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
        tx,
      );

      await audit([
        {
          organizationId: current.person.organizationId,
          module: "PESSOAS",
          action: "editar_pessoa",
          targetType: "Person",
          targetId: current.personId,
          before: { email: current.person.email },
          after: { email: input.email },
        },
        {
          organizationId: context.churchId,
          module: "ACESSO",
          action: "trocar_email_convite",
          targetType: "Invite",
          targetId: id,
          before: { email: current.email },
          after: { email: input.email },
        },
      ]);

      return updated;
    });

    const emailSent = await this.sendInviteEmail(invite, token);
    return { invite: mapInvite(invite), link: inviteUrl(token), emailSent };
  }

  // Página pública do convite (RF-CV05).
  async peek(token: string) {
    const invite = this.assertUsable(await this.repository.findByTokenHash(hashToken(token)));
    const keys = invite.assignments.flatMap(({ profile }) => profile.permissions.map((p) => p.permissionKey));

    return {
      churchName: invite.church.name,
      inviterName: inviterName(invite),
      personName: invite.person.name,
      email: invite.email,
      expiresAt: invite.expiresAt.toISOString(),
      organizations: groupAssignments(invite),
      permissions: summarizePermissions(keys),
      termsVersion: TERMS_VERSION,
    };
  }

  // Aceite: cria usuário, senha, atribuições e registra os termos numa transação (RF-CV05, RF-CV06).
  async accept(token: string, input: AcceptInviteInput, meta: { ip: string | null; userAgent: string | null }) {
    const invite = this.assertUsable(await this.repository.findByTokenHash(hashToken(token)));

    await assertValidNewPassword(input.password, { email: invite.email, churchName: invite.church.name });
    const passwordHash = await hashPassword(input.password);

    // O autor do log é o próprio usuário, que só ganha id dentro da transação.
    const actor: AuditActor = { type: "USUARIO", userId: null, ip: meta.ip, userAgent: meta.userAgent };

    // runGuarded: a concessão vale a partir do aceite, e quem já tem as protegidas é avisado agora.
    return runGuarded(actor, invite.church.id, async (tx, audit) => {
      if (!(await this.repository.consume(invite.id, tx))) {
        throw new AppError(404, "INVITE_INVALID", INVITE_INVALID_MESSAGE);
      }

      if (await tx.user.findUnique({ where: { email: invite.email }, select: { id: true } })) {
        throw new AppError(409, "EMAIL_IN_USE", "Já existe um acesso com este e-mail. Entre pela tela de login.");
      }

      if (await tx.user.findUnique({ where: { personId: invite.person.id }, select: { id: true } })) {
        throw new AppError(409, "PERSON_HAS_USER", "Esta pessoa já tem acesso ao iEzer. Entre pela tela de login.");
      }

      const now = new Date();
      const user = await tx.user.create({
        data: {
          email: invite.email,
          name: invite.person.name,
          emailVerified: true,
          status: "ATIVO",
          personId: invite.person.id,
          termsVersion: TERMS_VERSION,
          termsAcceptedAt: now,
        },
      });

      await tx.account.create({
        data: { userId: user.id, accountId: user.id, providerId: "credential", password: passwordHash },
      });

      actor.userId = user.id;
      await audit([
        await grantInvite(tx, invite, user.id),
        {
          organizationId: invite.church.id,
          module: "ACESSO",
          action: "aceitar_termos",
          targetType: "User",
          targetId: user.id,
          after: { termsVersion: TERMS_VERSION, acceptedAt: now },
        },
      ]);

      return { userId: user.id, email: user.email };
    });
  }

  // Primeiro acesso pelo Google (RF-CV05): o Better Auth cria o usuário com a pessoa do convite
  // (user.create.before em lib/auth.ts) e, ao abrir a sessão, o convite é consumido aqui. Sem
  // convite válido para a mesma pessoa, não faz nada. Os termos são aceitos na tela de termos.
  async completeForGoogleUser(userId: string, meta: { ip: string | null; userAgent: string | null }) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, personId: true } });
    if (!user?.personId) return;

    const invite = await this.repository.findPendingByEmail(user.email);
    if (!invite || invite.person.id !== user.personId) return;

    const actor: AuditActor = { type: "USUARIO", userId, ip: meta.ip, userAgent: meta.userAgent };

    await runGuarded(actor, invite.church.id, async (tx, audit) => {
      // Outro aceite concorrente já consumiu o convite.
      if (!(await this.repository.consume(invite.id, tx))) return;
      await audit(await grantInvite(tx, invite, userId, "google"));
    });
  }

  private assertUsable(invite: InviteWithRelations | null) {
    if (!invite || invite.status !== "PENDENTE") {
      throw new AppError(404, "INVITE_INVALID", INVITE_INVALID_MESSAGE);
    }

    if (invite.expiresAt <= new Date()) {
      throw new AppError(
        410,
        "INVITE_EXPIRED",
        "Este convite expirou. Peça ao administrador da sua igreja para reenviá-lo.",
      );
    }

    return invite;
  }

  private async findPendingOrThrow(id: string, churchId: string, db: Db) {
    const invite = await this.repository.findById(id, churchId, db);
    if (!invite) throw new InviteNotFoundError();

    if (invite.status !== "PENDENTE") {
      throw new AppError(409, "INVITE_NOT_PENDING", "Este convite já foi aceito ou cancelado.");
    }

    return invite;
  }

  private sendInviteEmail(invite: InviteWithRelations, token: string) {
    return trySendMail(
      inviteEmail({
        to: invite.email,
        personName: invite.person.name,
        churchName: invite.church.name,
        inviterName: inviterName(invite),
        token,
      }),
    );
  }
}

