import type { ModuleKey } from "@prisma/client";
import { runAudited, type AuditActor } from "./audit.js";
import { findUserChurch } from "./church.js";
import { trySendMail, type MailMessage } from "./mailer.js";
import { prisma } from "./prisma.js";

export interface NoticeTarget {
  to: string;
  name: string;
  churchName: string | null;
}

// Evento de segurança da própria conta: registro no log, na sede da igreja do usuário, e alerta
// por e-mail depois do commit (Segurança e sessão › Alertas por e-mail).
export async function recordAccountEvent(input: {
  actor: AuditActor;
  userId: string;
  action: string;
  module?: ModuleKey;
  description?: string;
  before?: unknown;
  after?: unknown;
  notice?: (target: NoticeTarget) => MailMessage;
}) {
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true, name: true } });
  if (!user) return;

  const church = await findUserChurch(input.userId);

  await runAudited(input.actor, (_tx, audit) =>
    audit({
      organizationId: church?.id ?? null,
      module: input.module ?? "ACESSO",
      action: input.action,
      targetType: "User",
      targetId: input.userId,
      description: input.description,
      before: input.before,
      after: input.after,
    }),
  );

  if (input.notice) {
    await trySendMail(input.notice({ to: user.email, name: user.name, churchName: church?.name ?? null }));
  }
}
