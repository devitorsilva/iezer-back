import type { Prisma } from "@prisma/client";
import { runAudited, type AuditActor } from "../../lib/audit.js";
import { findUserChurch } from "../../lib/church.js";
import { adminRecoveryNotice } from "../../lib/emails.js";
import { AppError } from "../../lib/errors.js";
import { trySendMail } from "../../lib/mailer.js";
import { prisma } from "../../lib/prisma.js";
import { activeGrantWhere } from "../../lib/support.js";
import { normalizeSearchText } from "../../lib/text.js";
import { inviteService } from "../acesso/convites/routes.js";
import type { SupportGrantRepository, SupportGrantRow } from "../acesso/suporte/repository.js";
import {
  auditGrant,
  expiresIn,
  grantStatus,
  invalidGrantStatus,
  mapGrant,
  notifySupportEmergency,
  notifySupportRequest,
  supportAdmins,
  SupportGrantNotFoundError,
} from "../acesso/suporte/service.js";
import type { CloseGrantInput, EmergencyInput, RecoverAdminInput, RequestGrantInput } from "./schemas.js";

export class ChurchNotFoundError extends Error {
  constructor() {
    super("CHURCH_NOT_FOUND");
  }
}

const CHURCH_LIST_LIMIT = 50;

// Back-office do suporte (RF-SP01, RF-SP09, RF-SP10, RT-AB14): o atendente pede acesso, abre e
// aprova emergências e recupera o admin. Tudo no mesmo AuditLog, na organização da igreja.
export class BackOfficeService {
  constructor(private readonly grants: SupportGrantRepository) {}

  async listChurches(search?: string) {
    const churches = await prisma.organization.findMany({
      where: {
        type: "SEDE",
        isActive: true,
        OR: search
          ? [
              { name: { contains: search, mode: "insensitive" } },
              { slug: { contains: search, mode: "insensitive" } },
              { cnpj: { contains: search.replace(/\D/g, "") || search } },
            ]
          : undefined,
      },
      orderBy: { name: "asc" },
      take: CHURCH_LIST_LIMIT,
      select: {
        id: true,
        name: true,
        slug: true,
        cnpj: true,
        contacts: { where: { role: "RESPONSAVEL_CONTA" }, select: { name: true, email: true, phone: true } },
        _count: { select: { children: { where: { isActive: true } } } },
        supportGrants: {
          where: activeGrantWhere(),
          orderBy: { expiresAt: "desc" },
          take: 1,
          select: { id: true, expiresAt: true, canWrite: true, origin: true },
        },
      },
    });

    const adminCounts = await Promise.all(churches.map((church) => supportAdmins(church.id)));

    return churches.map((church, index) => {
      const active = church.supportGrants[0];
      return {
        id: church.id,
        name: church.name,
        slug: church.slug,
        cnpj: church.cnpj,
        congregations: church._count.children,
        accountOwner: church.contacts[0] ?? null,
        admins: adminCounts[index]!.length,
        activeGrant: active
          ? { id: active.id, expiresAt: active.expiresAt!.toISOString(), canWrite: active.canWrite, origin: active.origin }
          : null,
      };
    });
  }

  async listGrants(churchId?: string) {
    return (await this.grants.findAll(churchId)).map(mapGrant);
  }

  // Pedido ligado a um chamado; nada é visto antes de um admin aprovar (RF-SP01).
  async request(actor: AuditActor, input: RequestGrantInput) {
    await this.assertChurch(input.churchId);

    const grant = await runAudited(actor, async (tx, audit) => {
      const grant = await this.grants.create(
        {
          churchId: input.churchId,
          origin: "PEDIDO_SUPORTE",
          status: "PENDENTE",
          ticket: input.ticket,
          reason: input.reason,
          scope: input.scope,
          canWrite: input.canWrite,
          writeJustification: input.canWrite ? (input.writeJustification ?? null) : null,
          durationHours: input.durationHours,
          requestedById: actor.userId,
        },
        tx,
      );
      await audit(auditGrant(grant, "suporte_pedir"));
      return grant;
    });

    const notified = await notifySupportRequest(grant);
    return { ...mapGrant(grant), notified };
  }

  // Emergência: fica aguardando um segundo atendente (RF-SP09).
  async requestEmergency(actor: AuditActor, input: EmergencyInput) {
    await this.assertChurch(input.churchId);

    const grant = await runAudited(actor, async (tx, audit) => {
      const grant = await this.grants.create(
        {
          churchId: input.churchId,
          origin: "EMERGENCIA",
          status: "AGUARDANDO_SEGUNDA_APROVACAO",
          emergencyKind: input.kind,
          ticket: input.ticket ?? null,
          reason: input.reason,
          scope: input.scope,
          canWrite: input.canWrite,
          writeJustification: input.canWrite ? (input.writeJustification ?? null) : null,
          durationHours: input.durationHours,
          requestedById: actor.userId,
        },
        tx,
      );
      await audit(auditGrant(grant, "suporte_emergencia_pedir"));
      return grant;
    });

    return mapGrant(grant);
  }

  // Segunda aprovação, por outro atendente: ativa na hora e avisa a igreja (RF-SP09).
  async approveEmergency(actor: AuditActor, id: string) {
    const grant = await this.decide(actor, id, async (tx, current) => {
      if (current.status !== "AGUARDANDO_SEGUNDA_APROVACAO") {
        throw invalidGrantStatus("Esta emergência não está aguardando aprovação.");
      }
      if (current.requestedBy?.id === actor.userId) {
        throw new AppError(403, "SUPPORT_SAME_APPROVER", "A segunda aprovação precisa ser de outro atendente.");
      }

      const now = new Date();
      return {
        action: "suporte_emergencia_aprovar",
        updated: await this.grants.transition(
          id,
          "AGUARDANDO_SEGUNDA_APROVACAO",
          {
            status: "ATIVO",
            approvedById: actor.userId,
            approvedAt: now,
            startsAt: now,
            expiresAt: expiresIn(current.durationHours, now),
          },
          tx,
        ),
      };
    });

    await notifySupportEmergency(grant);
    return mapGrant(grant);
  }

  // Desistir de um pedido ou emergência ainda não decididos.
  async cancel(actor: AuditActor, id: string, input: CloseGrantInput) {
    const grant = await this.decide(actor, id, async (tx, current) => {
      if (current.status !== "PENDENTE" && current.status !== "AGUARDANDO_SEGUNDA_APROVACAO") {
        throw invalidGrantStatus("Só pedidos ainda não decididos podem ser cancelados.");
      }

      return {
        action: "suporte_cancelar",
        updated: await this.grants.transition(
          id,
          current.status,
          { status: "CANCELADO", closedById: actor.userId, closedAt: new Date(), closeReason: input.reason ?? null },
          tx,
        ),
      };
    });

    return mapGrant(grant);
  }

  // Atendimento resolvido antes do prazo (e o único jeito de encerrar uma emergência).
  async end(actor: AuditActor, id: string, input: CloseGrantInput) {
    const grant = await this.decide(actor, id, async (tx, current) => {
      if (grantStatus(current) !== "ATIVO") throw invalidGrantStatus("Este acesso não está ativo.");

      return {
        action: "suporte_encerrar",
        updated: await this.grants.transition(
          id,
          "ATIVO",
          { status: "ENCERRADO", closedById: actor.userId, closedAt: new Date(), closeReason: input.reason ?? null },
          tx,
        ),
      };
    });

    return mapGrant(grant);
  }

  // Recuperação de admin (RF-SP10): a pedido do responsável pela conta, com a identidade conferida.
  // Usuário ativo da igreja ganha o perfil Pastor na sede; senão, a pessoa (achada pelo e-mail ou
  // criada na sede) recebe o convite. Nomeação no log e aviso aos admins atuais e ao responsável.
  async recoverAdmin(actor: AuditActor, churchId: string, input: RecoverAdminInput) {
    const church = await this.assertChurch(churchId);
    const pastor = await prisma.accessProfile.findUnique({
      where: { organizationId_factoryKey: { organizationId: churchId, factoryKey: "PASTOR" } },
      select: { id: true },
    });
    if (!pastor) throw new AppError(409, "PASTOR_PROFILE_MISSING", "A igreja não tem o perfil Pastor de fábrica.");

    const previousAdmins = await supportAdmins(churchId);
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, name: true, status: true, isSupportAgent: true },
    });

    let result: { adminName: string; viaInvite: boolean; link: string | null; emailSent: boolean };

    if (existingUser) {
      const userChurch = await findUserChurch(existingUser.id);
      if (existingUser.isSupportAgent || userChurch?.id !== churchId) {
        throw new AppError(409, "USER_OTHER_CHURCH", "Este e-mail é de um usuário de fora desta igreja.");
      }
      if (existingUser.status !== "ATIVO") {
        throw new AppError(
          409,
          "USER_NOT_ACTIVE",
          "Este usuário está desativado ou suspenso. Confira a situação da pessoa com o responsável pela conta.",
        );
      }

      await runAudited(actor, async (tx, audit) => {
        const { count } = await tx.userAssignment.createMany({
          data: [{ userId: existingUser.id, organizationId: churchId, profileId: pastor.id }],
          skipDuplicates: true,
        });
        if (count === 0) {
          throw new AppError(409, "ALREADY_ADMIN", `${existingUser.name} já tem o perfil Pastor na sede.`);
        }
        await audit({
          organizationId: churchId,
          module: "ACESSO",
          action: "suporte_recuperar_admin",
          targetType: "User",
          targetId: existingUser.id,
          description: `Verificação: ${input.verification}`,
          after: { name: existingUser.name, email: input.email, profile: "Pastor", viaInvite: false },
        });
      });

      result = { adminName: existingUser.name, viaInvite: false, link: null, emailSent: false };
    } else {
      const person = await runAudited(actor, async (tx, audit) => {
        const person =
          (await tx.person.findFirst({
            where: { email: input.email, organization: { OR: [{ id: churchId }, { parentId: churchId }] } },
            select: { id: true, name: true },
          })) ??
          (await tx.person.create({
            data: {
              organizationId: churchId,
              name: input.name,
              searchName: normalizeSearchText(input.name),
              email: input.email,
              mobilePhone: input.mobilePhone,
              bond: "MEMBRO",
              status: "ATIVO",
            },
            select: { id: true, name: true },
          }));

        await audit({
          organizationId: churchId,
          module: "ACESSO",
          action: "suporte_recuperar_admin",
          targetType: "Person",
          targetId: person.id,
          description: `Verificação: ${input.verification}`,
          after: { name: person.name, email: input.email, profile: "Pastor", viaInvite: true },
        });
        return person;
      });

      const context = { churchId, actor, organizations: null };
      const pending = await prisma.invite.findFirst({
        where: { personId: person.id, status: "PENDENTE", expiresAt: { gt: new Date() } },
        select: { id: true },
      });
      const invite = pending
        ? await inviteService.resend(context, pending.id, true)
        : await inviteService.create(context, {
            personId: person.id,
            assignments: [{ organizationId: churchId, profileIds: [pastor.id] }],
          });

      result = { adminName: person.name, viaInvite: true, link: invite.link, emailSent: invite.emailSent };
    }

    const recipients = new Map(
      [...church.contacts, ...previousAdmins].map((recipient) => [recipient.email.toLowerCase(), recipient]),
    );
    recipients.delete(input.email);
    const agentName = (await this.agentName(actor)) ?? "Suporte iEzer";
    await Promise.all(
      [...recipients.values()].map((recipient) =>
        trySendMail(
          adminRecoveryNotice({
            to: recipient.email,
            name: recipient.name,
            churchName: church.name,
            adminName: result.adminName,
            agentName,
            viaInvite: result.viaInvite,
          }),
        ),
      ),
    );

    return result;
  }

  private async agentName(actor: AuditActor) {
    if (!actor.userId) return null;
    const user = await prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true } });
    return user?.name ?? null;
  }

  private async assertChurch(churchId: string) {
    const church = await prisma.organization.findFirst({
      where: { id: churchId, type: "SEDE", isActive: true },
      select: {
        id: true,
        name: true,
        contacts: { where: { role: "RESPONSAVEL_CONTA" }, select: { name: true, email: true } },
      },
    });
    if (!church) throw new ChurchNotFoundError();
    return church;
  }

  private decide(
    actor: AuditActor,
    id: string,
    fn: (tx: Prisma.TransactionClient, current: SupportGrantRow) => Promise<{ action: string; updated: SupportGrantRow | null }>,
  ) {
    return runAudited(actor, async (tx, audit) => {
      const current = await this.grants.findById(id, null, tx);
      if (!current) throw new SupportGrantNotFoundError();

      const { action, updated } = await fn(tx, current);
      if (!updated) throw invalidGrantStatus("Este acesso mudou enquanto você decidia. Atualize a tela.");

      await audit(auditGrant(updated, action, current));
      return updated;
    });
  }
}
