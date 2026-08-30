"use client";

import { useState, type FormEvent } from "react";
import { ExternalLink, FileUp, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useCatalog } from "@/components/catalog-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  channelInputError,
  parseChannelInput,
} from "@/lib/channel";

export function TelegramWebPanel({
  onPastePosts,
}: {
  onPastePosts: () => void;
}) {
  const { addAndSync } = useCatalog();
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  const preview = parseChannelInput(value);

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    const parsed = parseChannelInput(value);
    if (!parsed.ok) {
      toast.error(channelInputError(parsed.reason));
      if (parsed.reason === "private_web") onPastePosts();
      return;
    }
    setAdding(true);
    const ok = await addAndSync(parsed.username);
    setAdding(false);
    if (ok) setValue("");
    else onPastePosts();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>用 Telegram 网页版</CardTitle>
        <CardDescription>
          影渠本身就是浏览器里用的 Web 应用。打开 Telegram
          网页版即可汇总，不必在 my.telegram.org 创建应用程序，也不必导出桌面数据。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            浏览器打开{" "}
            <a
              className="text-foreground underline underline-offset-2"
              href="https://web.telegram.org/k/"
              target="_blank"
              rel="noreferrer"
            >
              web.telegram.org
            </a>
            ，用和手机 / Mac 相同的号码登录。
          </li>
          <li>左侧点开电影频道。</li>
          <li>
            公开频道：复制地址栏链接（形如{" "}
            <code className="text-foreground">
              web.telegram.org/k/#@频道名
            </code>
            ）贴到下面。
          </li>
          <li>没有公开预览、或链接带一长串数字：在网页版里选中帖子复制，再点「粘贴导入」。</li>
        </ol>
        <form onSubmit={onAdd} className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://web.telegram.org/k/#@Aliyun_4K_Movies"
              className="h-9"
              aria-label="网页版频道链接"
            />
            <Button type="submit" disabled={adding} className="sm:w-40">
              {adding ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <Plus data-icon="inline-start" />
              )}
              提取公开预览
            </Button>
          </div>
          {preview.ok ? (
            <p className="text-xs text-muted-foreground">
              将提取 @{preview.username}
            </p>
          ) : null}
        </form>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onPastePosts}>
            <FileUp data-icon="inline-start" />
            从网页版粘贴帖子
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <a href="https://web.telegram.org/k/" target="_blank" rel="noreferrer" />
            }
          >
            <ExternalLink data-icon="inline-start" />
            打开 Telegram 网页版
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          影渠读的是 t.me 公开预览或你粘贴的原文，不会登录你的
          web.telegram.org 会话，也不会下载视频。
        </p>
      </CardContent>
    </Card>
  );
}
