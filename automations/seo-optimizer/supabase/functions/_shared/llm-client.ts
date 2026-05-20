// _shared/llm-client.ts
// Wrapper sobre Anthropic SDK (via OpenRouter passthrough).
// Soporta prompt caching del system prompt para bajar costo.

import Anthropic from "npm:@anthropic-ai/sdk@0.32.1";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");
  _client = new Anthropic({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
  });
  return _client;
}

function getModel(): string {
  return Deno.env.get("SEO_OPTIMIZER_MODEL") ?? DEFAULT_MODEL;
}

export interface LlmUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface CallWithUsageArgs {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  cacheSystem?: boolean;
}

export async function callWithUsage(args: CallWithUsageArgs): Promise<{ text: string; usage: LlmUsage }> {
  const client = getClient();
  const cacheSystem = args.cacheSystem ?? true;
  const systemBlocks = cacheSystem
    ? [{ type: "text" as const, text: args.system, cache_control: { type: "ephemeral" as const } }]
    : [{ type: "text" as const, text: args.system }];

  // deno-lint-ignore no-explicit-any
  const resp: any = await client.messages.create({
    model: getModel(),
    max_tokens: args.maxTokens ?? 2000,
    temperature: args.temperature ?? 0.3,
    system: systemBlocks,
    messages: [{ role: "user", content: args.user }],
  });

  // deno-lint-ignore no-explicit-any
  const text = (resp.content as any[])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");

  const usage: LlmUsage = {
    input_tokens: resp.usage?.input_tokens ?? 0,
    output_tokens: resp.usage?.output_tokens ?? 0,
    cache_creation_input_tokens: resp.usage?.cache_creation_input_tokens,
    cache_read_input_tokens: resp.usage?.cache_read_input_tokens,
  };
  return { text, usage };
}

export async function generate(args: CallWithUsageArgs): Promise<string> {
  const { text } = await callWithUsage(args);
  return text;
}

export async function generateJson<T = Record<string, unknown>>(args: CallWithUsageArgs): Promise<T> {
  const text = await generate({
    ...args,
    user: args.user + "\n\nRespond with ONLY a valid JSON object. No code fences, no commentary.",
    maxTokens: args.maxTokens ?? 4000,
    temperature: args.temperature ?? 0.1,
  });
  return parseLlmJson<T>(text);
}

export function parseLlmJson<T = Record<string, unknown>>(text: string): T {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const lines = cleaned.split("\n");
    cleaned = lines.slice(1, -1).join("\n");
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`LLM returned non-JSON: ${text.slice(0, 200)}`);
    return JSON.parse(match[0]) as T;
  }
}

export function getModelName(): string {
  return getModel();
}
