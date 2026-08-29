const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/;

export function normalizeChannelUsername(input: string): string | null {
  let value = input.trim();
  value = value.replace(/^https?:\/\/(www\.)?t\.me\/s\//i, "");
  value = value.replace(/^https?:\/\/(www\.)?t\.me\//i, "");
  value = value.replace(/^@/, "");
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
