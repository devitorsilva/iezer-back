import type { AuditActorType, ModuleKey, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export interface AuditActor {
  type: AuditActorType;
  userId: string | null;
  ip: string | null;
  userAgent: string | null;
}

export interface AuditEntry {
  organizationId: string | null;
  module: ModuleKey;
  action: string;
  targetType: string;
  targetId?: string | null;
  description?: string;
  before?: unknown;
  after?: unknown;
}

export type AuditWriter = (entries: AuditEntry | AuditEntry[]) => Promise<void>;

export const SYSTEM_ACTOR: AuditActor = { type: "SISTEMA", userId: null, ip: null, userAgent: null };

// Date vira ISO e Decimal vira string, como no JSON da API.
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

// Helper único de auditoria (RT-AB10): a alteração e o AuditLog na mesma transação.
// Se a gravação do log falhar, a alteração é desfeita.
export function runAudited<T>(
  actor: AuditActor,
  fn: (tx: Prisma.TransactionClient, audit: AuditWriter) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      const audit: AuditWriter = async (entries) => {
        const list = Array.isArray(entries) ? entries : [entries];
        if (list.length === 0) return;

        await tx.auditLog.createMany({
          data: list.map((entry) => ({
            actorType: actor.type,
            actorUserId: actor.userId,
            ip: actor.ip,
            userAgent: actor.userAgent,
            organizationId: entry.organizationId,
            module: entry.module,
            action: entry.action,
            description: entry.description,
            targetType: entry.targetType,
            targetId: entry.targetId ?? null,
            before: toJson(entry.before),
            after: toJson(entry.after),
          })),
        });
      };

      return fn(tx, audit);
    },
    { timeout: 15_000 },
  );
}
