// One place that creates the Jev client for every project.
//
//   const jev = createJev();
//   const { answers } = await jev.ask(state, { category: choice("…", { a: null, b: null }) });
//
// Real Jev when TYPESAFE_API_KEY is set, the offline mock otherwise (or with JEV_MOCK=1).
import "dotenv/config";
import { TypeSafeClient, choice, noul, score } from "@typesafe-ai/sdk";
import { mockFetch } from "./mock-jev.js";

export { choice, noul, score };

export function jevMode() {
  if (process.env.JEV_MOCK === "1" || !process.env.TYPESAFE_API_KEY?.trim()) return "mock";
  return "live";
}

export function createJev({ historySize = 50 } = {}) {
  const mode = jevMode();
  const client =
    mode === "mock"
      ? new TypeSafeClient({ apiKey: "mock", fetch: mockFetch, retry: { maxRetries: 0 } })
      : new TypeSafeClient();
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
