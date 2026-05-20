const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterCallInput {
  apiKey: string;
  model: string;
  messages: OpenRouterMessage[];
  max_tokens?: number;
  temperature?: number;
}

export interface OpenRouterCallOutput {
  content: string;
  tokens_in: number;
  tokens_out: number;
}

const RETRY_DELAYS_MS = [1000, 2000, 4000];

async function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export async function callOpenRouter(input: OpenRouterCallInput): Promise<OpenRouterCallOutput> {
  const body = JSON.stringify({
    model: input.model,
    messages: input.messages,
    max_tokens: input.max_tokens ?? 400,
    temperature: input.temperature ?? 0.2,
  });

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const resp = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${input.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/accesos-seo/Agents_Automations",
          "X-Title": "organic-early-warning",
        },
        body,
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "<no-body>");
        const e = new Error(`openrouter_http_${resp.status}: ${txt.slice(0, 200)}`);
        if (resp.status >= 500 || resp.status === 429) {
          lastErr = e;
          if (attempt < RETRY_DELAYS_MS.length) {
            await sleep(RETRY_DELAYS_MS[attempt]);
            continue;
          }
        }
        throw e;
      }
      const data = await resp.json();
      const content: string = data?.choices?.[0]?.message?.content?.trim() ?? "";
      const tokens_in: number = data?.usage?.prompt_tokens ?? 0;
      const tokens_out: number = data?.usage?.completion_tokens ?? 0;
      if (!content) {
        throw new Error("openrouter_empty_content");
      }
      return { content, tokens_in, tokens_out };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
    }
  }
  throw lastErr ?? new Error("openrouter_unknown_failure");
}
