// IP do cliente como o Fastify o resolve (trustProxy), repassado ao Better Auth para o log
// de login e logout (RF-LP01). O valor que vier do navegador neste header é descartado.
export const CLIENT_IP_HEADER = "x-iezer-client-ip";

export function withClientIp(headers: Headers, ip: string | undefined) {
  headers.delete(CLIENT_IP_HEADER);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  return headers;
}
