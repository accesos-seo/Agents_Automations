// _shared/openrouter.ts
// Wrapper minimalista para OpenRouter Chat Completions.
// Centraliza headers, modelo default y manejo de errores.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4";

export async function chat(
  prompt: string,
  max_tokens = 300,
  model?: string,
): Promise<string> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }
  const m = model ?? Deno.env.get("SEO_SENTINEL_MODEL") ?? DEFAULT_MODEL;

  const resp = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/accesos-seo/Agents_Automations",
      "X-Title": "seo-sentinel",
    },
    body: JSON.stringify({
      model: m,
      max_tokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok) {
    throw new Error(`OpenRouter ${resp.status}: ${await resp.text()}`);
  }

  const data = await resp.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenRouter empty response");
  }
  return text;
}
