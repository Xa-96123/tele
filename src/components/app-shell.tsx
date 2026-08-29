"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Clapperboard, Radio, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useCatalog } from "@/components/catalog-provider";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "片库", icon: Clapperboard },
  { href: "/channels", label: "频道", icon: Radio },
  { href: "/stats", label: "汇总", icon: BarChart3 },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, dismissNotice } = useCatalog();

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md">
        <div
          className={cn(
            "mx-auto flex h-14 w-full items-center justify-between px-4",
            pathname.startsWith("/stats") ? "max-w-[100rem]" : "max-w-6xl",
          )}
        >
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
              影
            </span>
            <span className="leading-tight">
              <span className="font-heading block text-[15px] font-semibold tracking-wide">
                影渠
              </span>
              <span className="text-[11px] text-muted-foreground">
                Telegram 影视汇总
              </span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Button
                  key={item.href}
                  variant={active ? "secondary" : "ghost"}
                  nativeButton={false}
                  render={<Link href={item.href} />}
                >
                  <item.icon data-icon="inline-start" />
                  {item.label}
                </Button>
              );
            })}
          </nav>
        </div>
      </header>

      {!state.noticeDismissed && (
        <div className="border-b border-amber-500/20 bg-amber-500/8">
          <div
            className={cn(
              "mx-auto flex w-full items-start gap-3 px-4 py-2.5 text-sm text-amber-100/90",
              pathname.startsWith("/stats") ? "max-w-[100rem]" : "max-w-6xl",
            )}
          >
            <p className="flex-1 leading-relaxed">
              影渠只读取公开频道的网页预览并汇总元数据，不下载、不托管视频文件。请只索引你有权查看的内容，并遵守当地法律与版权规定。
            </p>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="关闭说明"
              onClick={dismissNotice}
            >
              <X />
            </Button>
          </div>
        </div>
      )}

      <main
        className={cn(
          "mx-auto w-full flex-1 px-4 py-6 pb-24 md:pb-10",
          pathname.startsWith("/stats") ? "max-w-[100rem]" : "max-w-6xl",
        )}
      >
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md md:hidden">
        <div className="grid grid-cols-3">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px]",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
