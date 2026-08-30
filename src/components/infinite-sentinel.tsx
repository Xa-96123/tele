"use client";

import { useEffect, useRef } from "react";

export function InfiniteSentinel({
  remaining,
  onVisible,
}: {
  remaining: number;
  onVisible: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || remaining <= 0) return;
    if (typeof IntersectionObserver === "undefined") {
      onVisible();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onVisible();
      },
      { rootMargin: "720px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onVisible, remaining]);

  if (remaining <= 0) return null;

  return (
    <div
      ref={ref}
      className="col-span-full py-4 text-center text-xs text-muted-foreground"
    >
      还有 {remaining} 部，下滑继续加载海报
    </div>
  );
}
