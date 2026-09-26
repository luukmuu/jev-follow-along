// `npm run check`: tells you which Jev you're connected to and makes one real call.
import { APIConnectionError, AuthenticationError, BadRequestError, NotFoundError, PermissionDeniedError } from "@typesafe-ai/sdk";
import { createJev, noul } from "../lib/jev.js";

const QUESTION = { refund: noul("Is the customer asking for money back?") };
const STATE = "I was charged twice for my subscription.";

const jev = createJev();
const where = {
  typesafe: "TypeSafe API (TYPESAFE_API_KEY)",
  openrouter: "OpenRouter (OPENROUTER_API_KEY)",
  vercel: "Vercel AI Gateway (AI_GATEWAY_API_KEY)",
  mock: "offline mock (no key found in .env)",
}[jev.mode];

console.log(`Jev backend: ${where}`);
console.log(`Endpoint:    ${jev.client.baseURL}   model: ${jev.client.defaultModel}`);

try {
  const { answers, latencyMs, usage, model } = await jev.ask(STATE, QUESTION);
  console.log(`\n✅ It works. Model ${model} answered in ${latencyMs} ms (${usage.input_tokens} input tokens).`);
  console.log(`   "Is the customer asking for money back?" → yes with probability ${answers.refund.noul}`);
  if (jev.mode === "mock") console.log("\nℹ️  This was the mock. Put your key in .env to use real Jev.");
} catch (error) {
  console.error("\n❌ The call failed.");
  if (/allowlist|egress/i.test(error.message)) {
    console.error("   A network proxy blocked the request (not a key problem). Allow the host in your network settings.");
  } else if (/credit card|billing|payment|credits/i.test(error.message)) {
    console.error("   Your key works, but the account needs credits or billing set up (buy credits / add a card).");
    console.error("   Open the link in the details below, fix billing, then run `npm run check` again.");
  } else if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    console.error("   The key was rejected. Check it's copied completely into .env, with no quotes or spaces,");
    console.error("   and that it's under the right name (sk-or-… → OPENROUTER_API_KEY, vck_… → AI_GATEWAY_API_KEY).");
  } else if ((error instanceof NotFoundError || error instanceof BadRequestError) && jev.mode === "openrouter") {
    // OpenRouter docs show the model both as "typesafe/jev-1.13" and "jev-1.13"; try the other one.
    const other = jev.client.defaultModel === "jev-1.13" ? "typesafe/jev-1.13" : "jev-1.13";
    const retry = await jev.client.systemOne({ model: other, state: STATE, questions: QUESTION }).catch(() => null);
    if (retry) {
      console.error(`   The model name "${jev.client.defaultModel}" was not accepted, but "${other}" works.`);
      console.error(`   Add this line to .env:  JEV_MODEL=${other}`);
    } else {
      console.error("   OpenRouter didn't accept the request. See the details below.");
    }
  } else if (error instanceof NotFoundError) {
    console.error("   Endpoint or model not found. Check JEV_MODEL / AI_GATEWAY_TYPESAFE_URL if you set them.");
  } else if (error instanceof APIConnectionError) {
    console.error("   Couldn't reach the server. Check your internet connection (or the network allowlist).");
  }
  console.error(`   Details: ${error.message}`);
  process.exitCode = 1;
}
