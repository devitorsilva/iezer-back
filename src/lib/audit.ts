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
  // Pessoas afetadas (RF-LP04). Sem informar, vem do alvo Person, do `personId` no antes/depois,
  // dos `members` de uma família ou da pessoa do usuário/convite alvo.
  personIds?: string[];
}

export type AuditWriter = (entries: AuditEntry | AuditEntry[]) => Promise<void>;

export const SYSTEM_ACTOR: AuditActor = { type: "SISTEMA", userId: null, ip: null, userAgent: null };

// Date vira ISO e Decimal vira string, como no JSON da API.
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Minimização (RF-LP05): numa alteração, só os campos que mudaram, com antes e depois.
function changedOnly(
  before: Prisma.InputJsonValue | undefined,
  after: Prisma.InputJsonValue | undefined,
): { before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue } {
  const asRecord = (value: unknown) => (isRecord(value) ? value : null);
  const beforeRecord = asRecord(before);
  const afterRecord = asRecord(after);
  if (!beforeRecord || !afterRecord) return { before, after };

  const keys = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]);
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};

  for (const key of keys) {
    if (JSON.stringify(beforeRecord[key] ?? null) === JSON.stringify(afterRecord[key] ?? null)) continue;
    if (key in beforeRecord) changedBefore[key] = beforeRecord[key];
    if (key in afterRecord) changedAfter[key] = afterRecord[key];
  }

  return { before: changedBefore as Prisma.InputJsonValue, after: changedAfter as Prisma.InputJsonValue };
}

function personIdsOf(snapshot: unknown) {
  if (!isRecord(snapshot)) return [];

  const ids = typeof snapshot.personId === "string" ? [snapshot.personId] : [];
  if (Array.isArray(snapshot.members)) {
    for (const member of snapshot.members) {
      if (isRecord(member) && typeof member.personId === "string") ids.push(member.personId);
    }
  }
  return ids;
}

async function resolvePersonIds(tx: Prisma.TransactionClient, entry: AuditEntry) {
  if (entry.personIds) return [...new Set(entry.personIds)];

  const ids = [...personIdsOf(entry.before), ...personIdsOf(entry.after)];
  if (entry.targetId) {
    if (entry.targetType === "Person") ids.push(entry.targetId);
    if (entry.targetType === "User") {
      const user = await tx.user.findUnique({ where: { id: entry.targetId }, select: { personId: true } });
      if (user?.personId) ids.push(user.personId);
    }
    if (entry.targetType === "Invite") {
      const invite = await tx.invite.findUnique({ where: { id: entry.targetId }, select: { personId: true } });
      if (invite) ids.push(invite.personId);
    }
  }
  return [...new Set(ids)];
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

        const data: Prisma.AuditLogCreateManyInput[] = [];
        for (const entry of list) {
          data.push({
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
            ...changedOnly(toJson(entry.before), toJson(entry.after)),
            personIds: await resolvePersonIds(tx, entry),
          });
        }

        await tx.auditLog.createMany({ data });
      };

      return fn(tx, audit);
    },
    { timeout: 15_000 },
  );
}
