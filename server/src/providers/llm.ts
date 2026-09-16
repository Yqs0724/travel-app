/** OpenAI 兼容 chat；未配置 Key 抛 50202。支持多模态（DeepSeek Flash 等看图模型）。 */

const TIMEOUT_MS = 90_000;

export type LlmImage = {
  /** 如 image/jpeg */
  mime: string;
  /** 纯 base64，不含 data: 前缀 */
  data: string;
};

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

async function chatJsonRequest(system: string, userContent: string | ContentPart[]): Promise<unknown> {
  const key = process.env.LLM_API_KEY?.trim();
  if (!key) throw Object.assign(new Error("LLM API Key 未配置"), { code: 50202 });

  const base = (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw Object.assign(new Error(`LLM 请求失败: ${res.status} ${text.slice(0, 120)}`), {
        code: 50202,
      });
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw Object.assign(new Error("LLM 无返回"), { code: 50202 });
    // 偶发包在 ```json 里
    const raw = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    return JSON.parse(raw) as unknown;
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw Object.assign(new Error("LLM 超时"), { code: 50202 });
    }
    if ((e as Error & { code?: number }).code) throw e;
    throw Object.assign(new Error((e as Error).message || "LLM 失败"), { code: 50202 });
  } finally {
    clearTimeout(timer);
  }
}

export async function chatJson(system: string, user: string): Promise<unknown> {
  return chatJsonRequest(system, user);
}

export async function chatJsonWithImages(
  system: string,
  userText: string,
  images: LlmImage[],
): Promise<unknown> {
  if (images.length === 0) return chatJsonRequest(system, userText);
  const parts: ContentPart[] = [
    { type: "text", text: userText || "请根据图片提取地点名称。" },
    ...images.map(
      (img): ContentPart => ({
        type: "image_url",
        image_url: {
          url: `data:${img.mime};base64,${img.data}`,
          detail: "auto",
        },
      }),
    ),
  ];
  return chatJsonRequest(system, parts);
}

export async function chatJsonRetry(system: string, user: string): Promise<unknown> {
  try {
    return await chatJson(system, user);
  } catch (e) {
    if ((e as Error & { code?: number }).code === 50202 && !process.env.LLM_API_KEY) throw e;
    return chatJson(system, user);
  }
}

export async function chatJsonWithImagesRetry(
  system: string,
  userText: string,
  images: LlmImage[],
): Promise<unknown> {
  try {
    return await chatJsonWithImages(system, userText, images);
  } catch (e) {
    if ((e as Error & { code?: number }).code === 50202 && !process.env.LLM_API_KEY) throw e;
    return chatJsonWithImages(system, userText, images);
  }
}
