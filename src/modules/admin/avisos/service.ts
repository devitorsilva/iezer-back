import type { Prisma } from "@prisma/client";
import { announcementStatus, isDismissible } from "../../../lib/announcements.js";
import { runAudited } from "../../../lib/audit.js";
import { AppError } from "../../../lib/errors.js";
import type { TeamActionContext } from "../equipe/service.js";
import { dispatchDueAnnouncementEmails } from "./envio.js";
import type { AnnouncementCounts, AnnouncementRepository, AnnouncementRow } from "./repository.js";
import type { AnnouncementInput, ListAnnouncementsQuery } from "./schemas.js";

type Db = Prisma.TransactionClient;

export class AnnouncementNotFoundError extends Error {
  constructor() {
    super("ANNOUNCEMENT_NOT_FOUND");
  }
}

const iso = (date: Date | null) => date?.toISOString() ?? null;

function mapAnnouncement(row: AnnouncementRow, counts: AnnouncementCounts, now = new Date()) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    linkUrl: row.linkUrl,
    level: row.level,
    dismissible: isDismissible(row.level),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    audience: row.audience,
    churchStatuses: row.churchStatuses,
    churches: row.churches.map(({ organization }) => organization),
    recipients: row.recipients,
    sendEmail: row.sendEmail,
    emailSentAt: iso(row.emailSentAt),
    emailRecipientCount: row.emailRecipientCount,
    status: announcementStatus(row, now),
    createdByName: row.createdBy?.name ?? null,
    publishedAt: iso(row.publishedAt),
    publishedByName: row.publishedBy?.name ?? null,
    closedAt: iso(row.closedAt),
    seenCount: counts.seen,
    dismissedCount: counts.dismissed,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// O que fica no log: o aviso sem contagens nem datas de controle.
const auditSnapshot = (row: AnnouncementRow) => ({
  title: row.title,
  body: row.body,
  linkUrl: row.linkUrl,
  level: row.level,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  audience: row.audience,
  churchStatuses: row.churchStatuses,
  churchIds: row.churches.map(({ organization }) => organization.id),
  recipients: row.recipients,
  sendEmail: row.sendEmail,
});

const NO_COUNTS: AnnouncementCounts = { seen: 0, dismissed: 0 };

// Avisos em massa (B13, RF-BO44 a RF-BO49). Ver: Administrador e Suporte; o resto, só o
// Administrador iEzer. Ação sem igreja: AuditLog com organização nula e módulo BACKOFFICE (RT-BB12).
export class AnnouncementService {
  constructor(private readonly repository: AnnouncementRepository) {}

  async list(query: ListAnnouncementsQuery) {
    const now = new Date();
    const rows = await this.repository.findMany();
    const filtered = query.status ? rows.filter((row) => announcementStatus(row, now) === query.status) : rows;
    const counts = await this.repository.counts(filtered.map((row) => row.id));

    return filtered.map((row) => mapAnnouncement(row, counts.get(row.id) ?? NO_COUNTS, now));
  }

  async get(id: string) {
    const row = await this.repository.findById(id);
    if (!row) throw new AnnouncementNotFoundError();
    const counts = await this.repository.counts([id]);
    return mapAnnouncement(row, counts.get(id) ?? NO_COUNTS);
  }

  async create(context: TeamActionContext, input: AnnouncementInput) {
    const row = await runAudited(context.actor, async (tx, audit) => {
      await this.assertChurches(input, tx);
      const created = await this.repository.create(input, context.userId!, tx);

      await audit({
        organizationId: null,
        module: "BACKOFFICE",
        action: "criar_aviso",
        targetType: "Announcement",
        targetId: created.id,
        after: auditSnapshot(created),
      });
      return created;
    });

    return mapAnnouncement(row, NO_COUNTS);
  }

  // Editar até entrar no ar (RF-BO48): rascunho ou agendado. Um agendado com início no passado
  // entra no ar na hora.
  async update(context: TeamActionContext, id: string, input: AnnouncementInput) {
    const row = await runAudited(context.actor, async (tx, audit) => {
      const current = await this.findOrThrow(id, tx);
      const now = new Date();
      this.assertStatus(current, now, ["RASCUNHO", "AGENDADO"], "Só um aviso em rascunho ou agendado pode ser editado.");
      if (current.publishedAt && input.endsAt <= now) {
        throw new AppError(409, "ANNOUNCEMENT_ENDS_IN_PAST", "O fim do aviso precisa estar no futuro.", { field: "endsAt" });
      }
      await this.assertChurches(input, tx);

      const updated = await this.repository.update(id, input, now, tx);
      if (!updated) throw this.changedMeanwhile();

      await audit({
        organizationId: null,
        module: "BACKOFFICE",
        action: "editar_aviso",
        targetType: "Announcement",
        targetId: id,
        before: auditSnapshot(current),
        after: auditSnapshot(updated),
      });
      return updated;
    });

    void dispatchDueAnnouncementEmails();
    return this.get(row.id);
  }

  // Publicar: o rascunho vira agendado (ou entra no ar, se o início já passou).
  async publish(context: TeamActionContext, id: string) {
    await runAudited(context.actor, async (tx, audit) => {
      const current = await this.findOrThrow(id, tx);
      const now = new Date();
      this.assertStatus(current, now, ["RASCUNHO"], "Este aviso já foi publicado.");
      if (current.endsAt <= now) {
        throw new AppError(409, "ANNOUNCEMENT_ENDS_IN_PAST", "O fim do aviso já passou. Edite as datas antes de publicar.", {
          field: "endsAt",
        });
      }
      if (!(await this.repository.publish(id, context.userId!, now, tx))) throw this.changedMeanwhile();

      await audit({
        organizationId: null,
        module: "BACKOFFICE",
        action: "publicar_aviso",
        targetType: "Announcement",
        targetId: id,
        after: { title: current.title, startsAt: current.startsAt, endsAt: current.endsAt, sendEmail: current.sendEmail },
      });
    });

    void dispatchDueAnnouncementEmails();
    return this.get(id);
  }

  // Encerrar antes do fim (RF-BO48), no ar ou ainda agendado.
  async close(context: TeamActionContext, id: string) {
    await runAudited(context.actor, async (tx, audit) => {
      const current = await this.findOrThrow(id, tx);
      const now = new Date();
      this.assertStatus(current, now, ["AGENDADO", "NO_AR"], "Só um aviso agendado ou no ar pode ser encerrado.");
      if (!(await this.repository.close(id, now, tx))) throw this.changedMeanwhile();

      await audit({
        organizationId: null,
        module: "BACKOFFICE",
        action: "encerrar_aviso",
        targetType: "Announcement",
        targetId: id,
        before: { status: announcementStatus(current, now) },
        after: { title: current.title, closedAt: now },
      });
    });

    return this.get(id);
  }

  // Só rascunho é apagado; publicado fica para a contagem e a auditoria.
  async remove(context: TeamActionContext, id: string) {
    await runAudited(context.actor, async (tx, audit) => {
      const current = await this.findOrThrow(id, tx);
      this.assertStatus(current, new Date(), ["RASCUNHO"], "Só um rascunho pode ser apagado. Encerre o aviso publicado.");
      if (!(await this.repository.deleteDraft(id, tx))) throw this.changedMeanwhile();

      await audit({
        organizationId: null,
        module: "BACKOFFICE",
        action: "apagar_aviso",
        targetType: "Announcement",
        targetId: id,
        before: auditSnapshot(current),
      });
    });
  }

  private async findOrThrow(id: string, db: Db) {
    const row = await this.repository.findById(id, db);
    if (!row) throw new AnnouncementNotFoundError();
    return row;
  }

  private assertStatus(row: AnnouncementRow, now: Date, allowed: string[], message: string) {
    const status = announcementStatus(row, now);
    if (!allowed.includes(status)) throw new AppError(409, "ANNOUNCEMENT_STATUS_INVALID", message, { status });
  }

  // Escolhidas: só sedes em Implantação ou Ativa (RF-BO45).
  private async assertChurches(input: AnnouncementInput, db: Db) {
    if (input.churchIds.length === 0) return;
    if ((await this.repository.countEligibleChurches(input.churchIds, db)) !== input.churchIds.length) {
      throw new AppError(
        400,
        "ANNOUNCEMENT_CHURCH_INVALID",
        "Escolha só igrejas em Implantação ou Ativa. Suspensas e encerradas não recebem avisos.",
        { field: "churchIds" },
      );
    }
  }

  private changedMeanwhile() {
    return new AppError(409, "ANNOUNCEMENT_STATUS_INVALID", "O aviso mudou agora há pouco. Recarregue a página.");
  }
}
