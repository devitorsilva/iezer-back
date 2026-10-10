// Cria a conta de uma igreja e convida o primeiro admin (RF-OB01, RF-OB02), no lugar da tela
// de back-office enquanto houver só a piloto.
// Uso: npm run igreja:criar -- <arquivo.json>
//
// {
//   "sedeId": "csedepiloto00000000000000",      // opcional: completa uma sede que já existe
//   "sede": { "name": "Igreja Exemplo", "cnpj": "00.000.000/0001-91" },
//   "responsavel": { "name": "...", "jobTitle": "Pastor presidente", "email": "...", "phone": "(11) 99999-9999" },
//   "encarregadoLgpd": { "name": "...", "email": "..." },   // opcional
//   "congregacoes": ["Congregação Vila Nova"],               // opcional
//   "admin": { "name": "...", "email": "...", "mobilePhone": "(11) 98888-7777" }
// }
//
// Pode rodar de novo: o que já existe (congregação com o mesmo nome, perfis, listas, pessoa
// com o mesmo e-mail) é mantido. O convite só é criado se o admin ainda não tem acesso.
import { readFileSync } from "node:fs";
import { z } from "zod";
import { runAudited, SYSTEM_ACTOR } from "../src/lib/audit.js";
import { isValidCnpj, normalizeCnpj } from "../src/lib/cnpj.js";
import { normalizePhone } from "../src/lib/phone.js";
import { prisma } from "../src/lib/prisma.js";
import { normalizeSearchText, slugify } from "../src/lib/text.js";
import { inviteService } from "../src/modules/acesso/convites/routes.js";
import { seedFactoryProfiles } from "../src/modules/acesso/perfis/factory.js";
import { seedChurchLists } from "../src/modules/pessoas/listas/factory.js";

const email = z.email().transform((value) => value.trim().toLowerCase());
const phone = z
  .string()
  .refine((value) => normalizePhone(value) !== null, "Telefone inválido.")
  .transform((value) => normalizePhone(value)!);

const contact = z.object({
  name: z.string().min(2),
  jobTitle: z.string().optional(),
  email,
  phone: phone.optional(),
});

const configSchema = z.object({
  sedeId: z.string().optional(),
  sede: z.object({
    name: z.string().min(2),
    cnpj: z.string().refine(isValidCnpj, "CNPJ inválido.").transform(normalizeCnpj).optional(),
  }),
  responsavel: contact,
  encarregadoLgpd: contact.optional(),
  congregacoes: z.array(z.string().min(2)).default([]),
  admin: z.object({ name: z.string().min(2), email, mobilePhone: phone.optional() }),
});

async function uniqueSlug(base: string) {
  let slug = base || "igreja";
  for (let suffix = 2; await prisma.organization.count({ where: { slug } }); suffix++) slug = `${base}-${suffix}`;
  return slug;
}

async function main() {
  const [file] = process.argv.slice(2);
  if (!file) throw new Error("Uso: npm run igreja:criar -- <arquivo.json>");

  const config = configSchema.parse(JSON.parse(readFileSync(file, "utf8")));

  const { churchId, personId, pastorProfileId } = await runAudited(SYSTEM_ACTOR, async (tx, audit) => {
    // Sede: nova ou existente (a piloto já tem id fixo desde a Sprint 1).
    let church = config.sedeId
      ? await tx.organization.findFirst({ where: { id: config.sedeId, type: "SEDE", parentId: null } })
      : null;

    if (config.sedeId && !church) throw new Error(`Sede ${config.sedeId} não encontrada.`);

    if (church) {
      church = await tx.organization.update({
        where: { id: church.id },
        data: { name: config.sede.name, cnpj: config.sede.cnpj ?? church.cnpj },
      });
    } else {
      church = await tx.organization.create({
        data: {
          name: config.sede.name,
          cnpj: config.sede.cnpj,
          type: "SEDE",
          slug: await uniqueSlug(slugify(config.sede.name)),
        },
      });
    }

    const contacts = [
      ["RESPONSAVEL_CONTA", config.responsavel],
      ["ENCARREGADO_LGPD", config.encarregadoLgpd],
    ] as const;

    for (const [role, data] of contacts) {
      if (!data) continue;
      const values = { name: data.name, jobTitle: data.jobTitle ?? null, email: data.email, phone: data.phone ?? null };
      await tx.organizationContact.upsert({
        where: { organizationId_role: { organizationId: church.id, role } },
        create: { organizationId: church.id, role, ...values },
        update: values,
      });
    }

    const existingCongregations = await tx.organization.findMany({
      where: { parentId: church.id },
      select: { name: true },
    });
    const existingNames = new Set(existingCongregations.map((item) => normalizeSearchText(item.name)));
    const createdCongregations: string[] = [];

    for (const name of config.congregacoes) {
      if (existingNames.has(normalizeSearchText(name))) continue;
      await tx.organization.create({
        data: {
          name,
          type: "CONGREGACAO",
          parentId: church.id,
          slug: await uniqueSlug(`${church.slug}-${slugify(name)}`),
        },
      });
      createdCongregations.push(name);
    }

    const profiles = await seedFactoryProfiles(tx, church.id);
    const listItems = await seedChurchLists(tx, church.id);

    const pastor = await tx.accessProfile.findUniqueOrThrow({
      where: { organizationId_factoryKey: { organizationId: church.id, factoryKey: "PASTOR" } },
      select: { id: true },
    });

    // Pessoa do primeiro admin na sede (o convite sempre parte de uma Pessoa, A7).
    let person = await tx.person.findFirst({
      where: { email: config.admin.email, organization: { OR: [{ id: church.id }, { parentId: church.id }] } },
      select: { id: true },
    });

    if (!person) {
      person = await tx.person.create({
        data: {
          organizationId: church.id,
          name: config.admin.name,
          searchName: normalizeSearchText(config.admin.name),
          email: config.admin.email,
          mobilePhone: config.admin.mobilePhone,
          bond: "MEMBRO",
          status: "ATIVO",
        },
        select: { id: true },
      });
    }

    await audit({
      organizationId: church.id,
      module: "CONFIGURACOES",
      action: config.sedeId ? "completar_igreja" : "criar_igreja",
      targetType: "Organization",
      targetId: church.id,
      after: {
        name: church.name,
        cnpj: church.cnpj,
        congregations: createdCongregations,
        factoryProfiles: profiles,
        churchListItems: listItems,
        adminPersonId: person.id,
      },
    });

    console.log(
      `${church.name} (${church.id}): ${createdCongregations.length} congregação(ões) nova(s), ` +
        `perfis criados: ${profiles.join(", ") || "nenhum"}, ${listItems} item(ns) de lista.`,
    );

    return { churchId: church.id, personId: person.id, pastorProfileId: pastor.id };
  });

  const existingUser = await prisma.user.findFirst({ where: { personId }, select: { email: true } });
  if (existingUser) {
    console.log(`O admin já tem acesso (${existingUser.email}); nenhum convite criado.`);
    return;
  }

  const pending = await prisma.invite.findFirst({
    where: { personId, status: "PENDENTE", expiresAt: { gt: new Date() } },
    select: { id: true },
  });

  const result = pending
    ? await inviteService.resend({ churchId, actor: SYSTEM_ACTOR, organizations: null }, pending.id, true)
    : await inviteService.create(
        { churchId, actor: SYSTEM_ACTOR, organizations: null },
        { personId, assignments: [{ organizationId: churchId, profileIds: [pastorProfileId] }] },
      );

  console.log(
    `Convite do primeiro admin (Pastor na sede) para ${result.invite.email}` +
      `${result.emailSent ? " enviado por e-mail" : " (e-mail não enviado)"}. Válido até ${result.invite.expiresAt}.`,
  );
  console.log(`Link: ${result.link}`);
}

main()
  .catch((error) => {
    console.error(error instanceof z.ZodError ? z.prettifyError(error) : error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
