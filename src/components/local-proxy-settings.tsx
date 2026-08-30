"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  clientProxyUrl,
  readStoredProxy,
  writeStoredProxy,
} from "@/lib/local-proxy";

export function LocalProxySettings() {
  const [value, setValue] = useState("");
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    setValue(readStoredProxy());
  }, []);

  function save(next: string) {
    const normalized = clientProxyUrl(next);
    if (next.trim() && !normalized) {
      toast.error("只接受本机代理，例如 7890 或 http://127.0.0.1:7890");
      return;
    }
    writeStoredProxy(normalized ?? "");
    setValue(normalized ?? "");
    toast.success(normalized ? `已使用代理 ${normalized}` : "已清除代理");
  }

  async function probe() {
    setProbing(true);
    try {
      const res = await fetch("/api/channels/proxy-probe");
      const data = (await res.json()) as {
        suggestion?: string;
        found?: Array<{ url: string; label: string }>;
      };
      if (!data.suggestion) {
        toast.error("没扫到本机常见代理端口。可手动填 Clash 的 7890。");
        return;
      }
      save(data.suggestion);
      const extra = (data.found ?? []).slice(1, 3).map((item) => item.label);
      toast.message(`检测到 ${data.found?.[0]?.label ?? "本地代理"}`, {
        description: extra.length ? `也发现了 ${extra.join("、")}` : undefined,
      });
    } catch {
      toast.error("检测本机代理失败");
    } finally {
      setProbing(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-border/80 p-3">
      <Label htmlFor="local-proxy">本机代理（VPN 开了但提取失败时）</Label>
      <p className="text-xs text-muted-foreground">
        浏览器走了系统代理，<code className="text-foreground">next dev</code>{" "}
        默认不会。Clash 一般是 <code className="text-foreground">7890</code>。
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="local-proxy"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="http://127.0.0.1:7890"
          className="h-9"
        />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => save(value)}>
            保存
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void probe()}
            disabled={probing}
          >
            {probing ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : null}
            检测端口
          </Button>
        </div>
      </div>
    </div>
  );
}
