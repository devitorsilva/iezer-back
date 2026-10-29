import {
  ANNOUNCEMENT_LEVEL_LABELS,
  churchesForAnnouncementWhere,
  liveAnnouncementWhere,
} from "../../../lib/announcements.js";
import { recordAudit, SYSTEM_ACTOR } from "../../../lib/audit.js";
import { announcementEmail } from "../../../lib/emails.js";
import { trySendMail } from "../../../lib/mailer.js";
import { prisma } from "../../../lib/prisma.js";
import { findActiveAdmins } from "../igrejas/situacao.js";

// E-mail do aviso quando entra no ar (RF-BO46). Sem rotina agendada (Sprint 22), roda na
// publicação, a cada minuto no servidor e a cada GET /me/avisos. Quem marca `emailSentAt` primeiro
// envia; os outros pulam. Com o servidor dormindo (Render gratuito), o e-mail sai no próximo uso;
// aviso que acabou antes disso não manda.
const DISPATCH_INTERVAL_MS = 60_000;

let running = false;

export async function dispatchDueAnnouncementEmails() {
  if (running) return;
  running = true;

  try {
    const now = new Date();
    const due = await prisma.announcement.findMany({
      where: { ...liveAnnouncementWhere(now), sendEmail: true, emailSentAt: null },
      select: { id: true },
    });

    for (const { id } of due) {
      const { count } = await prisma.announcement.updateMany({
        where: { id, emailSentAt: null },
        data: { emailSentAt: now },
      });
      if (count > 0) await sendAnnouncementEmails(id);
    }
  } catch (error) {
    console.error("[avisos] falha no envio dos e-mails:", error);
  } finally {
    running = false;
  }
}

// Admins ativos e responsável pela conta de cada igreja do público, cada e-mail uma vez por igreja.
// Os destinatários do aviso no app (todos ou só admins) não mudam quem recebe o e-mail.
async function sendAnnouncementEmails(id: string) {
  const announcement = await prisma.announcement.findUniqueOrThrow({ where: { id } });
  const churches = await prisma.organization.findMany({
    where: churchesForAnnouncementWhere(announcement),
    select: {
      id: true,
      name: true,
      contacts: { where: { role: "RESPONSAVEL_CONTA" }, select: { name: true, email: true } },
    },
    orderBy: { name: "asc" },
  });

  let recipientCount = 0;
  for (const church of churches) {
    const recipients = new Map<string, string>();
    for (const person of [...(await findActiveAdmins(church.id)), ...church.contacts]) {
      const email = person.email.toLowerCase();
      if (!recipients.has(email)) recipients.set(email, person.name);
    }

    for (const [to, name] of recipients) {
      await trySendMail(
        announcementEmail({
          to,
          name,
          churchName: church.name,
          levelLabel: ANNOUNCEMENT_LEVEL_LABELS[announcement.level],
          title: announcement.title,
          body: announcement.body,
          linkUrl: announcement.linkUrl,
          endsAt: announcement.endsAt,
        }),
      );
    }
    recipientCount += recipients.size;
  }

  await prisma.announcement.update({ where: { id }, data: { emailRecipientCount: recipientCount } });
  await recordAudit(SYSTEM_ACTOR, {
    organizationId: null,
    module: "BACKOFFICE",
    action: "enviar_email_aviso",
    targetType: "Announcement",
    targetId: id,
    after: { title: announcement.title, churches: churches.length, recipients: recipientCount },
  });
}

export function startAnnouncementEmailDispatcher() {
  const timer = setInterval(() => void dispatchDueAnnouncementEmails(), DISPATCH_INTERVAL_MS);
  timer.unref();
}
