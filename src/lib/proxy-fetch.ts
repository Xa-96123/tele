import { fetch as undiciFetch, ProxyAgent, Socks5ProxyAgent } from "undici";
import { resolveProxyUrl } from "@/lib/local-proxy";

function dispatcherFor(proxyUrl: string) {
  const protocol = new URL(proxyUrl).protocol;
  if (protocol.startsWith("socks")) {
    const socks = proxyUrl.replace(/^socks:\/\//i, "socks5://");
    return new Socks5ProxyAgent(socks);
  }
  return new ProxyAgent(proxyUrl);
}

export async function proxyAwareFetch(
  url: string,
  options: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    proxy?: string | null;
  } = {},
) {
  const proxy = resolveProxyUrl(options.proxy);
  return undiciFetch(url, {
    headers: options.headers,
    signal: options.signal,
    redirect: "follow",
    dispatcher: proxy ? dispatcherFor(proxy) : undefined,
  });
}

export function describeProxy(proxy?: string | null): string | undefined {
  return resolveProxyUrl(proxy);
}
