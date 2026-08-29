import type { Metadata } from "next";
import { Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { AppShell } from "@/components/app-shell";
import { CatalogProvider } from "@/components/catalog-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const sans = Noto_Sans_SC({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const serif = Noto_Serif_SC({
  variable: "--font-noto-serif",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "影渠 — Telegram 影视资源汇总",
  description:
    "从公开 Telegram 电影频道提取片名、画质和网盘/磁力信息，去重后汇总成可搜索片库。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`dark ${sans.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          forcedTheme="dark"
        >
          <TooltipProvider>
            <CatalogProvider>
              <AppShell>{children}</AppShell>
              <Toaster />
            </CatalogProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
