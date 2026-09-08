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
  };
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`);
  return String(payload.post_id ?? payload.message_id ?? payload.message?.body?.mid ?? payload.id ?? "");
}

async function publishVk(channel: SocialChannel, text: string, credentials: ChannelCredentials) {
  const params = new URLSearchParams({
    owner_id: channel.target,
    from_group: "1",
    message: text,
    access_token: credentials.token ?? "",
    v: "5.199",
  });
  return responseId(await fetch(`https://api.vk.com/method/wall.post?${params}`, {
    signal: AbortSignal.timeout(15_000),
  }));
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
  const params = new URLSearchParams({ chat_id: channel.target });
  const response = await fetch(`https://platform-api2.max.ru/messages?${params}`, {
    method: "POST",
    headers: {
      Authorization: credentials.token ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(15_000),
  });
  return responseId(response);
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