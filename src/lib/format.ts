export function hueFromString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

export function posterStyle(id: string): { background: string } {
  const hue = hueFromString(id);
  return {
    background: `linear-gradient(160deg, hsl(${hue} 28% 28%) 0%, hsl(${(hue + 42) % 360} 32% 12%) 100%)`,
  };
}

export function formatRelativeTime(iso?: string): string {
  if (!iso) return "时间未知";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const diff = Date.now() - date.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.round(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.round(hour / 24);
  if (day < 7) return `${day} 天前`;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
