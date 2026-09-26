// One place that creates the Jev client for every project.
//
//   const jev = createJev();
//   const { answers } = await jev.ask(state, { category: choice("…", { a: null, b: null }) });
//
// Which Jev you get:
//   TYPESAFE_API_KEY   → TypeSafe's own API (api.typesafe.ai)
//   AI_GATEWAY_API_KEY → Vercel AI Gateway, which exposes the same System One API
//   neither (or JEV_MOCK=1) → the offline mock
import "dotenv/config";
import { TypeSafeClient, choice, noul, score } from "@typesafe-ai/sdk";
import { mockFetch } from "./mock-jev.js";

export { choice, noul, score };

const VERCEL_BASE_URL = "https://ai-gateway.vercel.sh/typesafe";
const VERCEL_MODEL = "typesafe-ai/jev";

const env = (name) => process.env[name]?.trim() || undefined;

/** "typesafe" | "vercel" | "mock" */
export function jevMode() {
  if (process.env.JEV_MOCK === "1") return "mock";
  if (env("TYPESAFE_API_KEY")) return "typesafe";
  if (env("AI_GATEWAY_API_KEY")) return "vercel";
  return "mock";
}

function createClient(mode) {
  if (mode === "mock") return new TypeSafeClient({ apiKey: "mock", fetch: mockFetch, retry: { maxRetries: 0 } });
  if (mode === "vercel") {
    // Same SDK, pointed at the gateway. The gateway names the model "typesafe-ai/jev".
    return new TypeSafeClient({
      apiKey: env("AI_GATEWAY_API_KEY"),
      baseURL: env("AI_GATEWAY_TYPESAFE_URL") ?? VERCEL_BASE_URL,
      defaultModel: env("JEV_MODEL") ?? VERCEL_MODEL,
    });
  }
  return new TypeSafeClient({ defaultModel: env("JEV_MODEL") }); // reads TYPESAFE_API_KEY
}

export function createJev({ historySize = 50 } = {}) {
  const mode = jevMode();
  const client = createClient(mode);
  const history = [];

  /** Ask a batch of typed questions about one state. Returns answers plus timing and usage. */
  async function ask(state, questions, options) {
    const started = performance.now();
    const result = await client.systemOne({ state, questions }, options);
    const latencyMs = Math.round(performance.now() - started);
    const entry = { at: new Date().toISOString(), latencyMs, questions: Object.keys(questions), usage: result.usage };
    history.unshift(entry);
    history.length = Math.min(history.length, historySize);
    return { ...result, latencyMs, mode };
  }

  return { mode, client, ask, history };
}

/** Labels sorted by probability, highest first: [[label, p], ...]. */
export function ranked(choiceAnswer) {
  return Object.entries(choiceAnswer.probabilities).sort((a, b) => b[1] - a[1]);
}
