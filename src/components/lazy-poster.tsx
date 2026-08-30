"use client";

import { useEffect, useRef, useState } from "react";
import { posterStyle } from "@/lib/format";
import { cn } from "@/lib/utils";

type VisibleCallback = () => void;

let sharedObserver: IntersectionObserver | null = null;
const visibleCallbacks = new WeakMap<Element, VisibleCallback>();

function getSharedObserver() {
  if (typeof IntersectionObserver === "undefined") return null;
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const notify = visibleCallbacks.get(entry.target);
          if (!notify) continue;
          visibleCallbacks.delete(entry.target);
          sharedObserver?.unobserve(entry.target);
          notify();
        }
      },
      { rootMargin: "280px 0px 520px 0px", threshold: 0.01 },
    );
  }
  return sharedObserver;
}

function observeWhenVisible(element: Element, onVisible: VisibleCallback) {
  const observer = getSharedObserver();
  if (!observer) {
    onVisible();
    return () => undefined;
  }
  visibleCallbacks.set(element, onVisible);
  observer.observe(element);
  return () => {
    visibleCallbacks.delete(element);
    observer.unobserve(element);
  };
}

export function LazyPoster({
  src,
  alt = "",
  fallbackId,
  letter,
  className,
  imgClassName,
  letterClassName,
  eager = false,
}: {
  src?: string;
  alt?: string;
  fallbackId: string;
  letter: string;
  className?: string;
  imgClassName?: string;
  letterClassName?: string;
  eager?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(eager && Boolean(src));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!src) {
      setActive(false);
      return;
    }
    if (eager) {
      setActive(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    return observeWhenVisible(node, () => setActive(true));
  }, [src, eager]);

  const showImage = Boolean(src) && active && !failed;

  return (
    <div
      ref={ref}
      className={cn("relative overflow-hidden", className)}
      style={showImage ? undefined : posterStyle(fallbackId)}
    >
      {showImage ? (
        // Telegram CDN posters; skip next/image host allowlisting.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          decoding="async"
          draggable={false}
          className={cn("size-full object-cover", imgClassName)}
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className={cn(
            "absolute inset-0 flex items-end p-3",
            letterClassName,
          )}
        >
          <span className="font-heading font-semibold text-white/85">
            {letter}
          </span>
        </div>
      )}
    </div>
  );
}
