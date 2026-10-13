import { randomBytes } from "node:crypto";

let counter = 0;

// Id no formato cuid ("c" + 24 caracteres), para gravações em lote (`createMany`) que precisam
// ligar registros novos entre si na mesma transação. Passa no `z.string().cuid()`.
export function createId() {
  const time = Date.now().toString(36).padStart(8, "0");
  const count = (counter++ % 1_679_616).toString(36).padStart(4, "0");
  const random = randomBytes(8).readBigUInt64BE().toString(36).padStart(13, "0").slice(0, 12);
  return `c${time}${count}${random}`;
}
