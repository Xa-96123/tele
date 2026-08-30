"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, LogOut, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { useCatalog } from "@/components/catalog-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AccountChannel } from "@/lib/types";
import {
  clearAccountAuth,
  readAccountAuth,
  writeAccountAuth,
  type AccountAuth,
} from "@/lib/account-session";

type Config = { hasServerCredentials: boolean };

export function AccountPanel({
  onUseExport,
  onUseWeb,
}: {
  onUseExport?: () => void;
  onUseWeb?: () => void;
}) {
  const { ingestSyncResult } = useCatalog();
  const [config, setConfig] = useState<Config>({ hasServerCredentials: false });
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [needPassword, setNeedPassword] = useState(false);
  const [pending, setPending] = useState<{
    session: string;
    phoneCodeHash: string;
    phone: string;
    isCodeViaApp?: boolean;
  } | null>(null);
  const [auth, setAuth] = useState<AccountAuth | null>(null);
  const [channels, setChannels] = useState<AccountChannel[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/telegram/account/config");
        const data = (await res.json()) as Config;
        if (!cancelled) setConfig(data);
      } catch {
        // keep defaults
      }
      const stored = readAccountAuth();
      if (!stored || cancelled) return;
      setBusy("dialogs");
      try {
        const res = await fetch("/api/telegram/account/dialogs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session: stored.session,
            apiId: stored.apiId,
            apiHash: stored.apiHash,
          }),
        });
        const data = (await res.json()) as {
          channels?: AccountChannel[];
          session?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "读取频道失败");
        if (cancelled) return;
        const next = { ...stored, session: data.session || stored.session };
        writeAccountAuth(next);
        setAuth(next);
        setPhone(next.phone);
        if (next.apiId) setApiId(String(next.apiId));
        if (next.apiHash) setApiHash(next.apiHash);
        setChannels(data.channels ?? []);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "读取频道失败");
        }
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadDialogs(current: AccountAuth) {
    setBusy("dialogs");
    try {
      const res = await fetch("/api/telegram/account/dialogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: current.session,
          apiId: current.apiId,
          apiHash: current.apiHash,
        }),
      });
      const data = (await res.json()) as {
        channels?: AccountChannel[];
        session?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "读取频道失败");
      const next = { ...current, session: data.session || current.session };
      writeAccountAuth(next);
      setAuth(next);
      setChannels(data.channels ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取频道失败");
    } finally {
      setBusy(null);
    }
  }

  async function sendCode() {
    setBusy("code");
    try {
      const res = await fetch("/api/telegram/account/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiId: apiId || undefined,
          apiHash: apiHash || undefined,
          phone,
        }),
      });
      const data = (await res.json()) as {
        session?: string;
        phoneCodeHash?: string;
        phone?: string;
        isCodeViaApp?: boolean;
        error?: string;
      };
      if (!res.ok || !data.session || !data.phoneCodeHash) {
        throw new Error(data.error || "发送验证码失败");
      }
      setPending({
        session: data.session,
        phoneCodeHash: data.phoneCodeHash,
        phone: data.phone || phone,
        isCodeViaApp: data.isCodeViaApp,
      });
      toast.success(
        data.isCodeViaApp
          ? "验证码已发到 Telegram 应用"
          : "验证码已发送，请同时查看短信和 Telegram",
        { description: "打开 Mac 上已登录的 Telegram，在官方账号对话里复制数字。" },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "发送验证码失败");
    } finally {
      setBusy(null);
    }
  }

  async function signIn() {
    if (!pending) return;
    setBusy("signin");
    try {
      const res = await fetch("/api/telegram/account/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiId: apiId || undefined,
          apiHash: apiHash || undefined,
          session: pending.session,
          phone: pending.phone,
          phoneCodeHash: pending.phoneCodeHash,
          phoneCode: code,
          password: password || undefined,
        }),
      });
      const data = (await res.json()) as {
        session?: string;
        phone?: string;
        displayName?: string;
        needPassword?: boolean;
        error?: string;
      };
      if (data.needPassword) {
        setNeedPassword(true);
        throw new Error(data.error || "请输入两步验证云密码");
      }
      if (!res.ok || !data.session) {
        throw new Error(data.error || "登录失败");
      }
      const next: AccountAuth = {
        session: data.session,
        phone: data.phone || pending.phone,
        apiId: apiId ? Number(apiId) : undefined,
        apiHash: apiHash || undefined,
        displayName: data.displayName,
      };
      writeAccountAuth(next);
      setAuth(next);
      setPending(null);
      setCode("");
      setPassword("");
      toast.success(`已用 ${next.displayName || "该账号"} 登录`);
      await loadDialogs(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "登录失败");
    } finally {
      setBusy(null);
    }
  }

  async function extractChannel(channel: AccountChannel) {
    setBusy(channel.username);
    try {
      const current = readAccountAuth();
      if (!current) throw new Error("请先登录。");
      const res = await fetch("/api/telegram/account/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: current.session,
          apiId: current.apiId,
          apiHash: current.apiHash,
          username: channel.username,
          peerId: channel.peerId,
          limit: 80,
        }),
      });
      const data = (await res.json()) as {
        result?: Parameters<typeof ingestSyncResult>[0];
        session?: string;
        error?: string;
      };
      if (!res.ok || !data.result) throw new Error(data.error || "提取失败");
      if (data.session) {
        writeAccountAuth({ ...current, session: data.session });
        setAuth({ ...current, session: data.session });
      }
      ingestSyncResult(data.result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提取失败");
    } finally {
      setBusy(null);
    }
  }

  function logout() {
    clearAccountAuth();
    setAuth(null);
    setChannels([]);
    setPending(null);
    toast.success("已退出影渠登录（Telegram 里可到「设备和会话」注销 Yingqu）");
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q),
    );
  }, [channels, query]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>用 Mac 上已登录的 Telegram</CardTitle>
        <CardDescription>
          验证码会发到你已经打开的 Telegram 桌面版（官方账号对话），不需要再扫二维码。登录后可以读取你加入过的频道，包括没有网页预览的私密频道。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!auth ? (
          <>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                用同一个手机号打开{" "}
                <a
                  className="text-foreground underline underline-offset-2"
                  href="https://my.telegram.org/apps"
                  target="_blank"
                  rel="noreferrer"
                >
                  my.telegram.org/apps
                </a>
                。若以前创建过，页面上直接就是 api_id / api_hash，不用再点创建。
              </li>
              <li>把手机号填成 Mac Telegram 使用的号码（含 +86 区号）。</li>
              <li>点发送验证码，回到 Telegram 桌面版复制数字。</li>
            </ol>
            <ApiAppHelp onUseExport={onUseExport} onUseWeb={onUseWeb} />
            {!config.hasServerCredentials ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="api-id">API ID</Label>
                  <Input
                    id="api-id"
                    inputMode="numeric"
                    value={apiId}
                    onChange={(e) => setApiId(e.target.value)}
                    placeholder="123456"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="api-hash">API Hash</Label>
                  <Input
                    id="api-hash"
                    value={apiHash}
                    onChange={(e) => setApiHash(e.target.value)}
                    placeholder="32 位字符串"
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                本机已配置 API 凭证，只需填写手机号。
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="phone">手机号</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+8613800138000"
              />
            </div>
            {pending ? (
              <div className="space-y-3 rounded-xl bg-muted/40 p-3">
                <p className="text-sm">
                  打开 Mac 的 Telegram，在与「Telegram」官方账号的对话里复制验证码。
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="tg-code">验证码</Label>
                  <Input
                    id="tg-code"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="12345"
                  />
                </div>
                {needPassword ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="tg-pass">两步验证云密码</Label>
                    <Input
                      id="tg-pass"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                ) : null}
                <Button onClick={() => void signIn()} disabled={busy === "signin"}>
                  {busy === "signin" ? (
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                  ) : null}
                  确认登录
                </Button>
              </div>
            ) : (
              <Button onClick={() => void sendCode()} disabled={busy === "code"}>
                {busy === "code" ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : null}
                发送验证码到 Telegram
              </Button>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                已登录{" "}
                <span className="font-medium">
                  {auth.displayName || auth.phone}
                </span>
                <span className="text-muted-foreground"> · {channels.length} 个频道/群</span>
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === "dialogs"}
                  onClick={() => auth && void loadDialogs(auth)}
                >
                  {busy === "dialogs" ? (
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <RefreshCw data-icon="inline-start" />
                  )}
                  刷新列表
                </Button>
                <Button variant="ghost" size="sm" onClick={logout}>
                  <LogOut data-icon="inline-start" />
                  退出
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="筛选你加入的电影频道…"
                className="pl-8"
              />
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {busy === "dialogs"
                    ? "正在读取你的频道…"
                    : "没有匹配的频道。确认 Mac Telegram 已经加入那些电影频道。"}
                </p>
              ) : (
                filtered.map((channel) => (
                  <div
                    key={channel.peerId}
                    className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-medium">{channel.title}</p>
                        <Badge variant="outline">
                          {channel.isPrivate ? "私密" : `@${channel.username}`}
                        </Badge>
                        <Badge variant="secondary">
                          {channel.kind === "channel" ? "频道" : "群"}
                        </Badge>
                      </div>
                      {channel.subscribers ? (
                        <p className="text-xs text-muted-foreground">
                          {channel.subscribers} 成员
                        </p>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      disabled={Boolean(busy)}
                      onClick={() => void extractChannel(channel)}
                    >
                      {busy === channel.username ? (
                        <Loader2 data-icon="inline-start" className="animate-spin" />
                      ) : null}
                      提取
                    </Button>
                  </div>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              已加入片库的账号频道，也可以在下方列表点「同步最新」。不会下载视频文件。
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ApiAppHelp({
  onUseExport,
  onUseWeb,
}: {
  onUseExport?: () => void;
  onUseWeb?: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-amber-500/25 bg-amber-500/8 p-3 text-sm">
      <p className="font-medium text-foreground">
        创建不了应用程序？这是 my.telegram.org 的常见情况，不是影渠坏了。
      </p>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>
          不要只停在首页，直接打开{" "}
          <a
            className="text-foreground underline underline-offset-2"
            href="https://my.telegram.org/apps"
            target="_blank"
            rel="noreferrer"
          >
            my.telegram.org/apps
          </a>
          。
        </li>
        <li>用无痕窗口，关掉翻译插件、广告拦截后再登录。</li>
        <li>
          应用名称填英文，例如 <code className="text-foreground">Yingqu</code>
          ；短名称只能字母和数字，5–32 位，例如{" "}
          <code className="text-foreground">yingqumac</code>
          ；平台选 Desktop；网址和说明可留空。
        </li>
        <li>
          每个账号通常只能有一个应用。已经有过的话，页面会直接显示
          api_id，继续点「创建」反而会报 ERROR。
        </li>
        <li>
          仍是 ERROR / 空白 / 没反应：先关掉机场/VPN，让网络尽量和手机号归属地一致，等十几分钟再试。
        </li>
      </ul>
      <p className="text-muted-foreground">
        试不通就改用网页版或桌面导出，都不需要 api_id。
      </p>
      <div className="flex flex-wrap gap-2">
        {onUseWeb ? (
          <Button variant="secondary" onClick={onUseWeb}>
            改用网页版
          </Button>
        ) : null}
        {onUseExport ? (
          <Button variant="outline" onClick={onUseExport}>
            改用桌面导出
          </Button>
        ) : null}
      </div>
    </div>
  );
}
