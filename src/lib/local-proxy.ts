export const PROXY_STORAGE_KEY = "yingqu.proxy.v1";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

export const COMMON_LOCAL_PROXIES = [
  { port: 7890, url: "http://127.0.0.1:7890", label: "Clash 混合/HTTP" },
  { port: 7897, url: "http://127.0.0.1:7897", label: "Clash Verge" },
  { port: 10809, url: "http://127.0.0.1:10809", label: "V2RayN HTTP" },
  { port: 6152, url: "http://127.0.0.1:6152", label: "Surge" },
  { port: 20171, url: "http://127.0.0.1:20171", label: "小火箭 / Quantumult" },
  { port: 8888, url: "http://127.0.0.1:8888", label: "常见 HTTP" },
  { port: 8118, url: "http://127.0.0.1:8118", label: "Privoxy" },
  { port: 1080, url: "socks5://127.0.0.1:1080", label: "常见 SOCKS5" },
  { port: 10808, url: "socks5://127.0.0.1:10808", label: "V2RayN SOCKS" },
  { port: 7891, url: "socks5://127.0.0.1:7891", label: "Clash SOCKS" },
] as const;

export function normalizeProxyInput(input?: string | null): string | undefined {
  const raw = input?.trim();
  if (!raw) return undefined;
  let value = raw;
  if (/^\d{2,5}$/.test(value)) {
    value = `http://127.0.0.1:${value}`;
  } else if (/^(127\.\d+\.\d+\.\d+|localhost):(\d{2,5})$/i.test(value)) {
    value = `http://${value}`;
  } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    value = `http://${value}`;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (!["http:", "https:", "socks:", "socks4:", "socks5:", "socks5h:"].includes(url.protocol)) {
    return undefined;
  }
  if (!url.port) return undefined;
  return url.toString().replace(/\/$/, "");
}

export function isLoopbackProxy(input: string): boolean {
  try {
    return LOOPBACK.has(new URL(input).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function clientProxyUrl(input?: string | null): string | undefined {
  const normalized = normalizeProxyInput(input);
  if (!normalized || !isLoopbackProxy(normalized)) return undefined;
  return normalized;
}

export function envProxyUrl(): string | undefined {
  return normalizeProxyInput(
    process.env.TELEGRAM_PROXY ||
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.ALL_PROXY ||
      process.env.all_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy,
  );
}

export function resolveProxyUrl(override?: string | null): string | undefined {
  return clientProxyUrl(override) ?? envProxyUrl();
}

export function readStoredProxy(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(PROXY_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeStoredProxy(value: string) {
  if (typeof window === "undefined") return;
  const normalized = clientProxyUrl(value) ?? value.trim();
  if (normalized) localStorage.setItem(PROXY_STORAGE_KEY, normalized);
  else localStorage.removeItem(PROXY_STORAGE_KEY);
}
