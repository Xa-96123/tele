const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/;

export type ChannelInput =
  | { ok: true; username: string }
  | { ok: false; reason: "empty" | "private_web" | "invalid" };

const WEB_AT_RE =
  /(?:https?:\/\/)?web\.telegram\.org\/(?:k|a|z)?\/?#@([a-zA-Z][a-zA-Z0-9_]{3,31})/i;
const WEB_PRIVATE_RE =
  /(?:https?:\/\/)?web\.telegram\.org\/(?:k|a|z)?\/?#-\d+/i;
const TME_PRIVATE_RE = /^https?:\/\/(?:www\.)?(?:t|telegram)\.me\/c\//i;

function decodeChannelInput(input: string): string {
  const trimmed = input.trim();
  try {
    return decodeURIComponent(trimmed.replace(/\+/g, "%20"));
  } catch {
    return trimmed;
  }
}

export function parseChannelInput(input: string): ChannelInput {
  const value = decodeChannelInput(input);
  if (!value) return { ok: false, reason: "empty" };
  if (WEB_PRIVATE_RE.test(value) || TME_PRIVATE_RE.test(value)) {
    return { ok: false, reason: "private_web" };
  }
  const username = normalizeChannelUsername(value);
  if (!username) return { ok: false, reason: "invalid" };
  return { ok: true, username };
}

export function channelInputError(
  reason: "empty" | "private_web" | "invalid",
): string {
  if (reason === "empty") {
    return "请输入公开频道用户名，或 Telegram 网页版 / t.me 链接。";
  }
  if (reason === "private_web") {
    return "这是网页版里的私密会话链接，没有公开预览。请在 web.telegram.org 打开频道，复制影片帖子，再点「粘贴导入」。";
  }
  return "请输入公开频道用户名，例如 moviehub，或 https://web.telegram.org/k/#@moviehub";
}

export function normalizeChannelUsername(input: string): string | null {
  let value = decodeChannelInput(input);

  const webAt = value.match(WEB_AT_RE);
  if (webAt?.[1]) return webAt[1];

  value = value.replace(/^tg:\/\/resolve\?domain=/i, "");
  value = value.replace(/^https?:\/\/(www\.)?(?:t|telegram)\.me\/s\//i, "");
  value = value.replace(/^https?:\/\/(www\.)?(?:t|telegram)\.me\//i, "");
  value = value.replace(/^#@/, "");
  value = value.replace(/^@/, "");
  value = value.replace(/[/?#].*$/, "");
  value = value.replace(/\/.*$/, "");
  value = value.trim();
  if (!USERNAME_RE.test(value)) return null;
  return value;
}

export function channelUrl(username: string): string {
  return `https://t.me/s/${username}`;
}

export function postUrl(username: string, messageId: number): string {
  return `https://t.me/${username}/${messageId}`;
}
