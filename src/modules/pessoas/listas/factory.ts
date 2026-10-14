import type { ChurchListType, Prisma } from "@prisma/client";

// Padrão de fábrica evangélico (RF-S01, RF-S02). Edição pela interface fica para a F2.
export const FACTORY_CHURCH_LISTS: Record<ChurchListType, string[]> = {
  FORMA_ADMISSAO: ["Profissão de fé e batismo", "Transferência por carta", "Aclamação", "Reconciliação"],
  MOTIVO_INATIVACAO: ["Mudou de cidade", "Afastamento", "Sem contato", "Outro"],
  MOTIVO_DESLIGAMENTO: ["A pedido", "Abandono", "Disciplinar", "Outro"],
  CARGO_ECLESIASTICO: ["Pastor", "Presbítero", "Diácono", "Evangelista", "Missionário", "Obreiro"],
  COMO_CONHECEU: ["Convite de amigo ou parente", "Redes sociais", "Passou em frente", "Evento", "Outro"],
};

// Cria os itens de fábrica que faltam na igreja (sede). Não mexe nos que já existem.
export async function seedChurchLists(db: Prisma.TransactionClient, churchId: string) {
  const data = Object.entries(FACTORY_CHURCH_LISTS).flatMap(([type, names]) =>
    names.map((name, index) => ({
      organizationId: churchId,
      type: type as ChurchListType,
      name,
      sortOrder: index,
    })),
  );

  const { count } = await db.churchListItem.createMany({ data, skipDuplicates: true });
  return count;
}
