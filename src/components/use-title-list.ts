"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TITLE_PAGE_SIZE } from "@/lib/catalog-list-params";
import { fetchTitleList } from "@/lib/catalog-remote";
import type { LinkKind, TitleListQuery, TitleRecord } from "@/lib/types";

export function useTitleList(
  query: Omit<TitleListQuery, "offset" | "limit">,
  revision: number,
  options?: { pageSize?: number },
) {
  const pageSize = options?.pageSize ?? TITLE_PAGE_SIZE;
  const [titles, setTitles] = useState<TitleRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [shareableTotal, setShareableTotal] = useState(0);
  const [years, setYears] = useState<number[]>([]);
  const [kinds, setKinds] = useState<LinkKind[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    const controller = new AbortController();
    const id = requestId.current + 1;
    requestId.current = id;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void fetchTitleList(
        { ...query, offset: 0, limit: pageSize },
        { signal: controller.signal },
      ).then((result) => {
        if (id !== requestId.current) return;
        if (!result.ok) {
          if (result.error === "aborted") return;
          setError(result.error);
          setTitles([]);
          setTotal(0);
          setLoading(false);
          return;
        }
        setTitles(result.titles);
        setTotal(result.total);
        setShareableTotal(result.shareableTotal);
        setYears(result.years);
        setKinds(result.kinds);
        setLoading(false);
      });
    }, query.q ? 200 : 0);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    query.channel,
    query.q,
    query.quality,
    query.sort,
    query.source,
    query.type,
    query.year,
    pageSize,
    revision,
  ]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || titles.length >= total) return;
    const id = requestId.current;
    setLoadingMore(true);
    void fetchTitleList({
      ...queryRef.current,
      offset: titles.length,
      limit: pageSize,
    }).then((result) => {
      if (id !== requestId.current) return;
      setLoadingMore(false);
      if (!result.ok) {
        if (result.error !== "aborted") setError(result.error);
        return;
      }
      setTitles((current) => {
        const seen = new Set(current.map((title) => title.id));
        return [
          ...current,
          ...result.titles.filter((title) => !seen.has(title.id)),
        ];
      });
      setTotal(result.total);
      setShareableTotal(result.shareableTotal);
      setYears(result.years);
      setKinds(result.kinds);
    });
  }, [loading, loadingMore, pageSize, titles.length, total]);

  return {
    titles,
    total,
    shareableTotal,
    years,
    kinds,
    loading,
    loadingMore,
    error,
    remaining: Math.max(total - titles.length, 0),
    loadMore,
  };
}
