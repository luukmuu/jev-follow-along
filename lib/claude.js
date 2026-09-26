// Claude does the parts Jev can't: writing text. Optional — every caller has a
// no-LLM fallback so the projects still run with only a Jev key (or none).
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";

// $ per million tokens, used only for the cost read-outs in the dashboards.
const PRICES = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export function claudePrice(model = CLAUDE_MODEL) {
  return PRICES[model] ?? PRICES["claude-opus-5"];
}

export function claudeEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim()) && process.env.JEV_MOCK !== "1";
}

let client;

/**
 * One Claude call. Pass `schema` (JSON Schema) to get parsed JSON back in `json`.
 * Returns null when no ANTHROPIC_API_KEY is configured.
 */
export async function askClaude({ system, prompt, schema, effort = "low", maxTokens = 4000 }) {
  if (!claudeEnabled()) return null;
  client ??= new Anthropic();
  const response = await client.beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
    output_config: { effort, ...(schema ? { format: { type: "json_schema", schema } } : {}) },
    // If a safety classifier declines, re-run on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined this request");
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  return { text, json: schema ? JSON.parse(text) : undefined, usage: response.usage, model: response.model };
}
