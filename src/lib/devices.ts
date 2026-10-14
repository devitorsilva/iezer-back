// Navegador e sistema a partir do user agent, para Minha conta › Sessões (RF-MC04) e o alerta de
// login em dispositivo novo. Comparação simples, sem fingerprint: "Chrome no Windows".

const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

const match = (value: string, list: [RegExp, string][]) => list.find(([pattern]) => pattern.test(value))?.[1];

export function describeDevice(userAgent: string | null | undefined) {
  if (!userAgent) return "Dispositivo desconhecido";

  const browser = match(userAgent, BROWSERS);
  const system = match(userAgent, SYSTEMS);

  if (browser && system) return `${browser} no ${system}`;
  return browser ?? system ?? "Dispositivo desconhecido";
}

// Cidade aproximada pelos headers de geolocalização da Vercel, quando o pedido passa por lá.
export function approximateLocation(headers: Headers | null | undefined) {
  const read = (name: string) => {
    const value = headers?.get(name);
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const parts = [read("x-vercel-ip-city"), read("x-vercel-ip-country-region"), read("x-vercel-ip-country")].filter(
    (part): part is string => Boolean(part),
  );

  return parts.length ? parts.join(", ").slice(0, 120) : null;
}
