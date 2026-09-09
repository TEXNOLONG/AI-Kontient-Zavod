import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { SocialChannel } from "@workspace/db";

export type Platform = "vk" | "ok" | "max" | "telegram" | "zen";
export type ChannelCredentials = {
  token?: string;
  applicationKey?: string;
  applicationSecret?: string;
  sessionSecret?: string;
};

const key = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be configured");
  return createHash("sha256").update(secret).digest();
};

export function encryptCredentials(credentials: ChannelCredentials): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptCredentials(value: string): ChannelCredentials {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Invalid channel credentials");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8"),
  ) as ChannelCredentials;
}

async function responseId(response: Response): Promise<string | undefined> {
  const payload = (await response.json().catch(() => ({}))) as {
    post_id?: unknown;
    message_id?: unknown;
    message?: { body?: { mid?: unknown } };
    id?: unknown;
    error?: unknown;
    error_msg?: unknown;
    description?: unknown;
  };
  if (!response.ok || payload.error || payload.error_msg) {
    const nestedError = typeof payload.error === "object" && payload.error !== null
      ? JSON.stringify(payload.error)
      : payload.error;
    throw new Error(
      String(nestedError ?? payload.error_msg ?? payload.description ?? `HTTP ${response.status}`),
    );
  }
  return String(payload.post_id ?? payload.message_id ?? payload.message?.body?.mid ?? payload.id ?? "");
}

function describeMaxNetworkError(error: unknown): Error {
  const cause = error instanceof Error && error.cause instanceof Error
    ? error.cause
    : error instanceof Error
      ? error
      : new Error(String(error));
  const code = "code" in cause && typeof cause.code === "string" ? ` (${cause.code})` : "";
  return new Error(`MAX API network/TLS error${code}: ${cause.message}`);
}

function normalizeVkOwnerId(target: string): string {
  const value = target.trim();
  const namedGroup = value.match(/(?:club|public|group)(\d+)/i);
  const numericGroup = value.match(/^-?\d+$/);
  const rawId = namedGroup?.[1] ?? numericGroup?.[0];
  const groupId = rawId ? Number(rawId) : Number.NaN;
  if (!Number.isSafeInteger(groupId) || groupId === 0) {
    throw new Error("Для VK укажите ID сообщества: например -123456 или vk.com/club123456");
  }
  return String(groupId > 0 ? -groupId : groupId);
}

async function readVkResponse(response: Response): Promise<Record<string, unknown>> {
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const error = payload.error;
  if (!response.ok || error) {
    const message = typeof error === "object" && error !== null
      ? (error as { error_msg?: unknown }).error_msg
      : error;
    throw new Error(String(message ?? `VK API HTTP ${response.status}`));
  }
  return payload;
}

async function publishVk(channel: SocialChannel, text: string, credentials: ChannelCredentials) {
  const params = new URLSearchParams({
    owner_id: normalizeVkOwnerId(channel.target),
    from_group: "1",
    message: text,
    access_token: credentials.token ?? "",
    v: "5.199",
  });
  return responseId(await fetch(`https://api.vk.com/method/wall.post?${params}`, {
    signal: AbortSignal.timeout(15_000),
  }));
}

async function verifyVk(channel: SocialChannel, credentials: ChannelCredentials): Promise<string> {
  if (!credentials.token) throw new Error("Для VK нужен токен сообщества");
  const groupId = normalizeVkOwnerId(channel.target).replace("-", "");
  const params = new URLSearchParams({
    group_id: groupId,
    access_token: credentials.token,
    v: "5.199",
  });
  const payload = await readVkResponse(await fetch(`https://api.vk.com/method/groups.getById?${params}`, {
    signal: AbortSignal.timeout(15_000),
  }));
  const groups = payload.response as { groups?: Array<{ name?: string }> } | undefined;
  const name = groups?.groups?.[0]?.name;
  return name ? `VK API доступен: ${name}` : "VK API доступен";
}

async function publishTelegram(channel: SocialChannel, text: string, credentials: ChannelCredentials) {
  const response = await fetch(`https://api.telegram.org/bot${credentials.token ?? ""}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: channel.target, text }),
    signal: AbortSignal.timeout(15_000),
  });
  return responseId(response);
}

async function publishMax(channel: SocialChannel, text: string, credentials: ChannelCredentials) {
  if (text.length > 4_000) {
    throw new Error(`MAX ограничивает длину сообщения 4000 символами; сейчас ${text.length}`);
  }
  const params = new URLSearchParams({ chat_id: channel.target });
  try {
    const response = await fetch(`https://platform-api2.max.ru/messages?${params}`, {
      method: "POST",
      headers: {
        Authorization: credentials.token ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const body = await response.text();
      let detail = body;
      try {
        const payload = JSON.parse(body) as {
          error?: unknown;
          error_msg?: unknown;
          description?: unknown;
        };
        const nestedError = typeof payload.error === "object" && payload.error !== null
          ? JSON.stringify(payload.error)
          : payload.error;
        detail = String(nestedError ?? payload.error_msg ?? payload.description ?? body);
      } catch {
        // Keep the raw response body when MAX does not return JSON.
      }
      throw new Error(`MAX API HTTP ${response.status}: ${detail.slice(0, 500)}`);
    }
    return responseId(response);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("MAX API HTTP")) throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("MAX API timeout after 15 seconds");
    }
    throw describeMaxNetworkError(error);
  }
}

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

async function publishOk(channel: SocialChannel, text: string, credentials: ChannelCredentials) {
  if (!credentials.token || !credentials.applicationKey || !credentials.applicationSecret) {
    throw new Error("Для OK нужны access token, application key и application secret");
  }
  const params: Record<string, string> = {
    application_key: credentials.applicationKey,
    access_token: credentials.token,
    attachment: JSON.stringify({ media: [{ type: "text", text }] }),
    format: "json",
    gid: channel.target,
    method: "mediatopic.post",
  };
  const sessionSecret = credentials.sessionSecret
    ? md5(credentials.token + credentials.sessionSecret)
    : credentials.applicationSecret;
  const signature = md5(
    Object.keys(params).sort().map((name) => `${name}=${params[name]}`).join("") + sessionSecret,
  );
  const body = new URLSearchParams({ ...params, sig: signature });
  return responseId(await fetch("https://api.ok.ru/fb.do", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  }));
}

async function publishZen(channel: SocialChannel, text: string, credentials: ChannelCredentials) {
  const webhook = credentials.token || channel.target;
  if (!webhook.startsWith("https://")) throw new Error("Для Дзен укажите HTTPS webhook-мост публикации");
  return responseId(await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: text.split("\n")[0]?.slice(0, 120), text, channel: channel.name }),
    signal: AbortSignal.timeout(15_000),
  }));
}

export async function publishToChannel(channel: SocialChannel, text: string): Promise<string | undefined> {
  const credentials = decryptCredentials(channel.credentials);
  switch (channel.platform as Platform) {
    case "vk": return publishVk(channel, text, credentials);
    case "ok": return publishOk(channel, text, credentials);
    case "max": return publishMax(channel, text, credentials);
    case "telegram": return publishTelegram(channel, text, credentials);
    case "zen": return publishZen(channel, text, credentials);
    default: throw new Error(`Платформа ${channel.platform} не поддерживается`);
  }
}

export async function testChannelConnection(channel: SocialChannel): Promise<string> {
  const credentials = decryptCredentials(channel.credentials);
  if (channel.platform === "vk") return verifyVk(channel, credentials);
  return "Подключение сохранено";
}