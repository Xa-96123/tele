import net from "node:net";
import { COMMON_LOCAL_PROXIES } from "@/lib/local-proxy";

function canConnect(port: number, timeoutMs = 250): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const finish = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export async function GET() {
  const found: Array<{ port: number; url: string; label: string }> = [];
  for (const item of COMMON_LOCAL_PROXIES) {
    if (await canConnect(item.port)) {
      found.push({ port: item.port, url: item.url, label: item.label });
    }
  }
  return Response.json({
    found,
    suggestion: found[0]?.url ?? "",
  });
}
