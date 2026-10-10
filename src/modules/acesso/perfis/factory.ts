import type { AccessProfileFactoryKey, Prisma } from "@prisma/client";
import { factoryPermissionKeys } from "../permissoes/catalog/index.js";

// Perfis de fábrica (PRD Pessoas › Catálogo e padrão de fábrica; RT-AB06).
export const FACTORY_PROFILES: Record<AccessProfileFactoryKey, { name: string; description: string }> = {
  PASTOR: {
    name: "Pastor",
    description: "Acesso total, inclusive notas pastorais e administração de acessos.",
  },
  TESOUREIRO: {
    name: "Tesoureiro",
    description: "Financeiro completo; vê pessoas e contribuições para vincular lançamentos.",
  },
  SECRETARIO: {
    name: "Secretário",
    description: "Cadastro e ciclo eclesiástico das pessoas, sem nada financeiro.",
  },
};

export const FACTORY_PROFILE_KEYS = Object.keys(FACTORY_PROFILES) as AccessProfileFactoryKey[];

// Cria os perfis de fábrica que faltam na igreja (sede). Não mexe nos que já existem.
export async function seedFactoryProfiles(db: Prisma.TransactionClient, churchId: string) {
  const existing = await db.accessProfile.findMany({
    where: { organizationId: churchId, factoryKey: { not: null } },
    select: { factoryKey: true },
  });
  const present = new Set(existing.map((profile) => profile.factoryKey));
  const created: AccessProfileFactoryKey[] = [];

  for (const factoryKey of FACTORY_PROFILE_KEYS) {
    if (present.has(factoryKey)) continue;

    await db.accessProfile.create({
      data: {
        organizationId: churchId,
        factoryKey,
        ...FACTORY_PROFILES[factoryKey],
        permissions: {
          create: factoryPermissionKeys(factoryKey).map((permissionKey) => ({ permissionKey })),
        },
      },
    });
    created.push(factoryKey);
  }

  return created;
}
