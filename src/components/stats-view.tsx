"use client";

import { useMemo, type ReactNode } from "react";
import { useCatalog } from "@/components/catalog-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { summarizeCatalog } from "@/lib/catalog";
import { LINK_LABELS, TYPE_LABELS } from "@/lib/labels";
import type { ResourceType } from "@/lib/types";

export function StatsView() {
  const { ready, state } = useCatalog();
  const stats = useMemo(
    () => summarizeCatalog(state.titles, state.channels),
    [state.channels, state.titles],
  );

  if (!ready) {
    return <div className="h-40 rounded-xl bg-muted" />;
  }

  const kpis = [
    { label: "去重后影片", value: stats.titleCount },
    { label: "来源版本", value: stats.editionCount },
    { label: "频道", value: stats.channelCount },
    { label: "识别到的链接", value: stats.linkCount },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-wide">
          汇总
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          跨频道去重后的片库结构，方便一眼看出类型、年代和资源形态。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((item) => (
          <Card key={item.label} size="sm">
            <CardHeader>
              <CardDescriptionStat>{item.label}</CardDescriptionStat>
              <CardTitle className="font-heading text-3xl tabular-nums">
                {item.value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <StatList
          title="按类型"
          rows={Object.entries(stats.byType).map(([key, count]) => ({
            label: TYPE_LABELS[key as ResourceType] ?? key,
            count,
          }))}
        />
        <StatList title="按画质" rows={stats.byResolution.map((r) => ({ label: r.label, count: r.count }))} />
        <StatList
          title="按来源"
          rows={stats.bySource.map((r) => ({
            label: LINK_LABELS[r.kind as keyof typeof LINK_LABELS] ?? r.kind,
            count: r.count,
          }))}
        />
        <StatList
          title="按频道"
          rows={stats.byChannel.map((r) => ({
            label: r.title,
            count: r.count,
          }))}
        />
      </div>

      <StatList
        title="按年份"
        rows={stats.byYear.map((r) => ({ label: r.year, count: r.count }))}
      />
    </div>
  );
}

function CardDescriptionStat({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function StatList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无数据</p>
        ) : (
          rows.map((row) => (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="truncate pr-3">{row.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {row.count}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(row.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
