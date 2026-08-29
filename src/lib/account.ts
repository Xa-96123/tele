import {
  Api,
  errors,
  password as telegramPassword,
  sessions,
  TelegramClient,
} from "teleproto";
import { syncFromPosts } from "@/lib/ingest";
import type { AccountChannel, ChannelInfo, ChannelPost, SyncResult } from "@/lib/types";

const { StringSession } = sessions;
const { SessionPasswordNeededError, PhoneCodeInvalidError, PhoneCodeExpiredError, FloodWaitError } =
  errors;

export class AccountError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly extra?: { needPassword?: boolean },
  ) {
    super(message);
    this.name = "AccountError";
  }
}

export function resolveApiCredentials(input: {
  apiId?: number | string;
  apiHash?: string;
}) {
  const apiId = Number(input.apiId || process.env.TELEGRAM_API_ID || 0);
  const apiHash = String(input.apiHash || process.env.TELEGRAM_API_HASH || "").trim();
  if (!apiId || !apiHash) {
    throw new AccountError(
      "请填写 API ID 和 API Hash。打开 https://my.telegram.org → API development tools，用与 Mac Telegram 相同的手机号申请。",
    );
  }
  return { apiId, apiHash };
}

export function normalizePhone(phone: string): string {
  const trimmed = phone.trim().replace(/[\s()-]/g, "");
  if (!trimmed) {
    throw new AccountError("请填写手机号，需带国际区号，例如 +86。");
  }
  if (!trimmed.startsWith("+")) {
    throw new AccountError("手机号请带国际区号，例如 +8613800138000。");
  }
  if (!/^\+\d{8,15}$/.test(trimmed)) {
    throw new AccountError("手机号格式不正确。");
  }
  return trimmed;
}

function mapAccountError(error: unknown): AccountError {
  if (error instanceof AccountError) return error;
  if (error instanceof SessionPasswordNeededError) {
    return new AccountError("账号开启了两步验证，请输入 Telegram 云密码。", 401, {
      needPassword: true,
    });
  }
  if (error instanceof PhoneCodeInvalidError) {
    return new AccountError("验证码不正确。请查看 Mac Telegram 里官方账号发来的数字。");
  }
  if (error instanceof PhoneCodeExpiredError) {
    return new AccountError("验证码已过期，请重新发送。");
  }
  if (error instanceof FloodWaitError) {
    return new AccountError(
      `请求过于频繁，请等待 ${error.seconds} 秒后再试。`,
      429,
    );
  }
  if (error instanceof errors.RPCError) {
    return new AccountError(error.errorMessage || "Telegram 拒绝了这次请求。", 400);
  }
  if (error instanceof Error && error.message) {
    return new AccountError(
      /timeout|connect|network|websocket/i.test(error.message)
        ? "连不上 Telegram。请确认网络可访问 DC，或改用桌面版导出。"
        : error.message,
      502,
    );
  }
  return new AccountError("账号操作失败，请稍后重试。", 500);
}

async function withClient<T>(options: {
  apiId: number;
  apiHash: string;
  session?: string;
  fn: (client: TelegramClient) => Promise<T>;
}): Promise<{ value: T; session: string }> {
  const client = new TelegramClient(
    new StringSession(options.session ?? ""),
    options.apiId,
    options.apiHash,
    {
      connectionRetries: 2,
      timeout: 20,
      deviceModel: "Yingqu",
      appVersion: "0.1.0",
      systemVersion: "macOS",
    },
  );
  try {
    await client.connect();
    const value = await options.fn(client);
    const session = client.session.save();
    if (typeof session !== "string" || !session) {
      throw new AccountError("无法保存登录会话，请重试。", 500);
    }
    return { value, session };
  } catch (error) {
    throw mapAccountError(error);
  } finally {
    try {
      await client.disconnect();
    } catch {
      // ignore
    }
  }
}

export async function sendLoginCode(input: {
  apiId?: number | string;
  apiHash?: string;
  phone: string;
}) {
  const creds = resolveApiCredentials(input);
  const phone = normalizePhone(input.phone);
  const { value, session } = await withClient({
    ...creds,
    fn: async (client) => client.sendCode(creds, phone),
  });
  return {
    session,
    phone,
    phoneCodeHash: value.phoneCodeHash,
    isCodeViaApp: value.isCodeViaApp,
  };
}

export async function signInWithCode(input: {
  apiId?: number | string;
  apiHash?: string;
  session: string;
  phone: string;
  phoneCodeHash: string;
  phoneCode: string;
  password?: string;
}) {
  const creds = resolveApiCredentials(input);
  const phone = normalizePhone(input.phone);
  const phoneCode = input.phoneCode.trim();
  if (!phoneCode) throw new AccountError("请输入验证码。");
  if (!input.session) throw new AccountError("登录会话丢失，请重新发送验证码。");

  const { value, session } = await withClient({
    ...creds,
    session: input.session,
    fn: async (client) => {
      try {
        await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: phone,
            phoneCodeHash: input.phoneCodeHash,
            phoneCode,
          }),
        );
      } catch (error) {
        if (error instanceof SessionPasswordNeededError) {
          if (!input.password?.trim()) {
            throw error;
          }
          const pwd = await client.invoke(new Api.account.GetPassword());
          await client.invoke(
            new Api.auth.CheckPassword({
              password: await telegramPassword.computeCheck(
                pwd,
                input.password.trim(),
              ),
            }),
          );
        } else {
          throw error;
        }
      }
      const me = await client.getMe();
      return {
        displayName:
          [me.firstName, me.lastName].filter(Boolean).join(" ") ||
          me.username ||
          phone,
        username: me.username,
      };
    },
  });

  return { session, phone, ...value };
}

export async function listAccountChannels(input: {
  apiId?: number | string;
  apiHash?: string;
  session: string;
}): Promise<{ session: string; channels: AccountChannel[] }> {
  const creds = resolveApiCredentials(input);
  if (!input.session) throw new AccountError("尚未登录。", 401);
  const { value, session } = await withClient({
    ...creds,
    session: input.session,
    fn: async (client) => {
      const dialogs = await client.getDialogs({ limit: 200 });
      const channels: AccountChannel[] = [];
      for (const dialog of dialogs) {
        if (!dialog.isChannel || !dialog.entity) continue;
        const entity = dialog.entity;
        if (entity.className !== "Channel") continue;
        const numericId = String(entity.id);
        const username = entity.username || `c${numericId}`;
        channels.push({
          id: numericId,
          username,
          title: entity.title || dialog.title || username,
          isPrivate: !entity.username,
          kind: entity.broadcast ? "channel" : "group",
          peerId: dialog.id ? String(dialog.id) : numericId,
          subscribers: entity.participantsCount
            ? String(entity.participantsCount)
            : undefined,
        });
      }
      return channels.sort((a, b) => a.title.localeCompare(b.title, "zh"));
    },
  });
  return { session, channels: value };
}

function hrefsFromMessage(message: {
  message?: string;
  text?: string;
  entities?: Array<{ className?: string; url?: string; offset?: number; length?: number }>;
}): string[] {
  const text = message.message || message.text || "";
  const hrefs: string[] = [];
  for (const entity of message.entities ?? []) {
    if (entity.className === "MessageEntityTextUrl" && entity.url) {
      hrefs.push(entity.url);
    } else if (
      entity.className === "MessageEntityUrl" &&
      typeof entity.offset === "number" &&
      typeof entity.length === "number"
    ) {
      hrefs.push(text.slice(entity.offset, entity.offset + entity.length));
    }
  }
  return hrefs;
}

export async function syncAccountChannel(input: {
  apiId?: number | string;
  apiHash?: string;
  session: string;
  username?: string;
  peerId?: string;
  offsetId?: number;
  limit?: number;
}): Promise<{ session: string; result: SyncResult }> {
  const creds = resolveApiCredentials(input);
  if (!input.session) throw new AccountError("尚未登录。", 401);
  const target = input.username || input.peerId;
  if (!target) throw new AccountError("缺少频道。");
  const limit = Math.min(Math.max(input.limit ?? 80, 20), 150);

  const { value, session } = await withClient({
    ...creds,
    session: input.session,
    fn: async (client) => {
      const entity = await client.getEntity(input.peerId || input.username || target);
      const title =
        "title" in entity && typeof entity.title === "string"
          ? entity.title
          : input.username || target;
      const username =
        "username" in entity && typeof entity.username === "string" && entity.username
          ? entity.username
          : input.username || `c${"id" in entity ? String(entity.id) : target}`;
      const isPrivate = !("username" in entity && entity.username);

      const messages = await client.getMessages(entity, {
        limit,
        offsetId: input.offsetId ?? 0,
      });

      const posts: ChannelPost[] = [];
      for (const message of messages) {
        const text = message.text || message.message || "";
        if (!text.trim()) continue;
        const unix =
          typeof message.date === "number"
            ? message.date
            : typeof message.date === "string"
              ? Number(message.date)
              : NaN;
        const postedAt = Number.isFinite(unix)
          ? new Date(unix * 1000).toISOString()
          : undefined;
        posts.push({
          channel: username,
          messageId: message.id,
          postUrl: isPrivate
            ? `https://t.me/c/${String(entity.id).replace(/^-100/, "")}/${message.id}`
            : `https://t.me/${username}/${message.id}`,
          postedAt,
          text,
          hrefs: hrefsFromMessage(message),
        });
      }

      const oldest = posts.at(-1)?.messageId;
      const channel: ChannelInfo = {
        username,
        title,
        description: isPrivate ? "来自已登录账号的私密频道" : "来自已登录账号",
        source: "account",
        peerId: input.peerId,
        isPrivate,
      };
      return syncFromPosts(channel, posts, {
        nextBefore: oldest ? String(oldest) : undefined,
        fetchedPages: 1,
      });
    },
  });

  return { session, result: value };
}

export function hasServerCredentials() {
  return Boolean(Number(process.env.TELEGRAM_API_ID) && process.env.TELEGRAM_API_HASH);
}
