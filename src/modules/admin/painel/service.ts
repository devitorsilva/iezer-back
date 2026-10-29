import type { HealthChurchRow, HealthRepository } from "./repository.js";

// Prazos dos alertas (RF-BO43), em dias.
export const HEALTH_THRESHOLDS = {
  implantacaoDays: 15,
  rejectedEmailDays: 7,
  withoutAccessDays: 30,
} as const;

// Consultas agregadas com cache de poucos minutos (RT-BB09).
const CACHE_TTL_MS = 2 * 60 * 1000;

// Nomes por cartão; a contagem é sempre a total.
const CHURCHES_PER_ALERT = 50;

export const HEALTH_ALERT_KEYS = [
  "SEM_ADMIN",
  "UM_ADMIN",
  "IMPLANTACAO_PARADA",
  "EMAIL_REJEITADO",
  "LOGIN_BLOQUEADO",
  "SEM_ACESSO",
  "PEDIDO_PENDENTE",
] as const;

export type HealthAlertKey = (typeof HEALTH_ALERT_KEYS)[number];

const alert = (key: HealthAlertKey, rows: HealthChurchRow[]) => ({
  key,
  count: rows.length,
  churches: rows.slice(0, CHURCHES_PER_ALERT).map(({ id, name, status }) => ({ id, name, status })),
});

export type HealthAlert = ReturnType<typeof alert>;

// Painel de saúde (RF-BO41 a RF-BO43, B10): os sete alertas por igreja, sem nome de pessoa.
export class HealthService {
  private cache: { at: number; value: Awaited<ReturnType<HealthService["build"]>> } | null = null;

  constructor(private readonly repository: HealthRepository) {}

  async get() {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.value;

    const value = await this.build();
    this.cache = { at: Date.now(), value };
    return value;
  }

  private async build() {
    const now = new Date();
    const [adminCounts, stuck, rejected, locked, withoutAccess, pending] = await Promise.all([
      this.repository.adminCounts(),
      this.repository.stuckInImplantacao(HEALTH_THRESHOLDS.implantacaoDays, now),
      this.repository.withRejectedEmails(HEALTH_THRESHOLDS.rejectedEmailDays, now),
      this.repository.withLockedLogin(now),
      this.repository.withoutAccess(HEALTH_THRESHOLDS.withoutAccessDays, now),
      this.repository.withPendingRequests(now),
    ]);

    return {
      generatedAt: now.toISOString(),
      thresholds: HEALTH_THRESHOLDS,
      alerts: [
        alert("SEM_ADMIN", adminCounts.filter((church) => church.admins === 0)),
        alert("UM_ADMIN", adminCounts.filter((church) => church.admins === 1)),
        alert("IMPLANTACAO_PARADA", stuck),
        alert("EMAIL_REJEITADO", rejected),
        alert("LOGIN_BLOQUEADO", locked),
        alert("SEM_ACESSO", withoutAccess),
        alert("PEDIDO_PENDENTE", pending),
      ],
    };
  }
}
