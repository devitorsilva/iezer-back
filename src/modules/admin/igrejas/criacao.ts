import { Prisma } from "@prisma/client";
import { runAudited, type AuditActor } from "../../../lib/audit.js";
import { AppError } from "../../../lib/errors.js";
import { normalizeSearchText, slugify } from "../../../lib/text.js";
import { inviteService } from "../../acesso/convites/routes.js";
import { assertLoginEmailAvailable } from "../../acesso/convites/service.js";
import { seedFactoryProfiles } from "../../acesso/perfis/factory.js";
import { cnpjTakenError } from "../../organizacao/service.js";
import { seedChurchLists } from "../../pessoas/listas/factory.js";
import type { CreateChurchInput } from "./schemas.js";

type Db = Prisma.TransactionClient;

// Perfis, listas e convite com o banco longe: a transação passa dos 15 s padrão.
const CREATE_CHURCH_TIMEOUT_MS = 60_000;

async function uniqueSlug(db: Db, base: string) {
  let slug = base || "igreja";
  for (let suffix = 2; await db.organization.count({ where: { slug } }); suffix++) slug = `${base}-${suffix}`;
  return slug;
}

function assertDistinctNames(churchName: string, congregations: string[]) {
  const seen = new Set([normalizeSearchText(churchName)]);
  for (const name of congregations) {
    const key = normalizeSearchText(name);
    if (seen.has(key)) {
      throw new AppError(400, "ORGANIZATION_NAME_TAKEN", `O nome "${name}" aparece mais de uma vez.`, {
        field: "congregations",
      });
    }
    seen.add(key);
  }
}

async function assertCnpjAvailable(db: Db, cnpj: string) {
  const other = await db.organization.findFirst({ where: { cnpj, parentId: null }, select: { id: true } });
  if (other) throw cnpjTakenError(other.id);
}

// Criação de igreja (RF-BO12 a RF-BO14, RT-BB05), no lugar do script igreja:criar. Numa transação:
// sede em Implantação, congregações, contatos, perfis de fábrica, listas, Pessoa do primeiro admin e
// convite com o perfil Pastor na sede. O e-mail do convite sai depois do commit; o link não volta
// para a equipe (B8: só o convidado entra).
export async function createChurch(actor: AuditActor, input: CreateChurchInput) {
  assertDistinctNames(input.name, input.congregations);

  const created = await runAudited(
    actor,
    async (tx, audit) => {
      await assertCnpjAvailable(tx, input.cnpj);
      // Antes de gravar, para recusar logo o e-mail de outra igreja ou da equipe (RF-BO14, RF-CV08).
      // O convite confere de novo.
      await assertLoginEmailAvailable(tx, input.admin.email, "");

      const churchSlug = await uniqueSlug(tx, slugify(input.name));
      const church = await tx.organization.create({
        data: { name: input.name, cnpj: input.cnpj, type: "SEDE", slug: churchSlug, status: "IMPLANTACAO" },
      });

      for (const name of input.congregations) {
        await tx.organization.create({
          data: {
            name,
            type: "CONGREGACAO",
            parentId: church.id,
            slug: await uniqueSlug(tx, `${churchSlug}-${slugify(name) || "congregacao"}`),
          },
        });
      }

      const contacts = [
        ["RESPONSAVEL_CONTA", input.accountOwner],
        ["ENCARREGADO_LGPD", input.lgpdOfficer],
      ] as const;

      for (const [role, data] of contacts) {
        if (!data) continue;
        await tx.organizationContact.create({
          data: {
            organizationId: church.id,
            role,
            name: data.name,
            jobTitle: data.jobTitle ?? null,
            email: data.email,
            phone: data.phone ?? null,
          },
        });
      }

      const profiles = await seedFactoryProfiles(tx, church.id);
      const listItems = await seedChurchLists(tx, church.id);

      const pastor = await tx.accessProfile.findUniqueOrThrow({
        where: { organizationId_factoryKey: { organizationId: church.id, factoryKey: "PASTOR" } },
        select: { id: true },
      });

      // O convite sempre parte de uma Pessoa (A7): o primeiro admin nasce na sede.
      const person = await tx.person.create({
        data: {
          organizationId: church.id,
          name: input.admin.name,
          searchName: normalizeSearchText(input.admin.name),
          email: input.admin.email,
          bond: "MEMBRO",
          status: "ATIVO",
        },
        select: { id: true },
      });

      await audit({
        organizationId: church.id,
        module: "CONFIGURACOES",
        action: "criar_igreja",
        targetType: "Organization",
        targetId: church.id,
        after: {
          name: church.name,
          cnpj: church.cnpj,
          status: church.status,
          congregations: input.congregations,
          accountOwner: input.accountOwner.name,
          lgpdOfficer: input.lgpdOfficer?.name ?? null,
          factoryProfiles: profiles,
          churchListItems: listItems,
          adminPersonId: person.id,
        },
      });

      const invite = await inviteService.createInTx(
        tx,
        audit,
        { churchId: church.id, actor, organizations: null },
        { personId: person.id, assignments: [{ organizationId: church.id, profileIds: [pastor.id] }] },
      );

      return { church, invite };
    },
    { timeout: CREATE_CHURCH_TIMEOUT_MS },
  ).catch((error: unknown) => {
    // Duas criações com o mesmo CNPJ ao mesmo tempo: o índice parcial segura a segunda.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "CHURCH_CNPJ_TAKEN", "Já existe uma igreja com este CNPJ.", { field: "cnpj" });
    }
    throw error;
  });

  const { invite, emailSent } = await inviteService.sendCreatedInvite(created.invite);

  return {
    church: { id: created.church.id, name: created.church.name, status: created.church.status },
    invite: { email: invite.email, expiresAt: invite.expiresAt, emailSent },
  };
}
