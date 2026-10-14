import { createHash, randomBytes } from "node:crypto";

// Tokens de convite (RT-AB08): 256 bits aleatórios no link, só o SHA-256 no banco.
export function generateToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
