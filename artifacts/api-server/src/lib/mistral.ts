import { logger } from "./logger";

type MistralMessage = {
  role: "system" | "user";
  content: string;
};

type MistralResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

export async function askMistral(
  messages: MistralMessage[],
  fallback: string,
): Promise<string> {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) {
    return fallback;
  }

  try {
    const response = await fetch(MISTRAL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages,
        temperature: 0.7,
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status },
        "Mistral request failed; using local fallback",
      );
      return fallback;
    }

    const payload = (await response.json()) as MistralResponse;
    return payload.choices?.[0]?.message?.content?.trim() || fallback;
  } catch (error) {
    logger.warn({ err: error }, "Mistral unavailable; using local fallback");
    return fallback;
  }
}

export async function askMistralJson<T>(
  messages: MistralMessage[],
  fallback: T,
): Promise<T> {
  const raw = await askMistral(
    [
      ...messages,
      {
        role: "system",
        content:
          "Return only valid JSON. Do not wrap it in markdown fences or add commentary.",
      },
    ],
    JSON.stringify(fallback),
  );

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}