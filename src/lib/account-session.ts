const KEY = "yingqu.telegram.account.v1";

export type AccountAuth = {
  session: string;
  phone: string;
  apiId?: number;
  apiHash?: string;
  displayName?: string;
};

export function readAccountAuth(): AccountAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AccountAuth;
    if (!parsed.session) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeAccountAuth(auth: AccountAuth) {
  localStorage.setItem(KEY, JSON.stringify(auth));
}

export function clearAccountAuth() {
  localStorage.removeItem(KEY);
}
