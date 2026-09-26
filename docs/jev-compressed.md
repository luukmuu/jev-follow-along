# Jev — compressed reference

The video's first step: "read the documentation completely and save a compressed
version" so your coding agent knows the API without going back to the browser.
This is that file. It was written from the official JavaScript SDK
(`@typesafe-ai/sdk` 0.6.0, its README and type definitions). Check
<https://docs.typesafe.ai> for changes.

## What Jev is

- TypeSafe AI's "System One" model. It answers **typed questions** about a
  **state** and returns **probabilities**, not text.
- Question types: `noul` (yes/no), `choice` (one of N labels), `score`
  (an ordered rubric with 2 or more levels).
- It is fast and cheap. It cannot write sentences, explain itself, write code or
  reason step by step. Use it for the if-statements (classify, route, rank,
  gate) and let plain code act on the probabilities. Call an LLM only when you
  need text.
- Text input only, with a 32K context window.

## Setup

```sh
npm install @typesafe-ai/sdk        # Node 20+
export TYPESAFE_API_KEY=...          # console → API keys
```

| Env var | Default |
|---|---|
| `TYPESAFE_API_KEY` | required |
| `TYPESAFE_BASE_URL` | `https://api.typesafe.ai` |
| `TYPESAFE_DEFAULT_MODEL` | `jev-latest` |
| `TYPESAFE_LOG_LEVEL` | `warn` (`debug` logs bodies) |

### Via Vercel AI Gateway

Vercel AI Gateway exposes the same System One API at
`https://ai-gateway.vercel.sh/typesafe`. The request and response shapes are
identical, but the auth and the model name differ:

| | TypeSafe direct | Vercel AI Gateway |
|---|---|---|
| Endpoint | `https://api.typesafe.ai/v1/systemone` | `https://ai-gateway.vercel.sh/typesafe/v1/systemone` |
| Key | `TYPESAFE_API_KEY` | `AI_GATEWAY_API_KEY` (`vck_…`) |
| Model | `jev-latest` | `typesafe-ai/jev` |

```js
const client = new TypeSafeClient({
  apiKey: process.env.AI_GATEWAY_API_KEY,
  baseURL: "https://ai-gateway.vercel.sh/typesafe",
  defaultModel: "typesafe-ai/jev",
});
```

`lib/jev.js` picks this automatically when only `AI_GATEWAY_API_KEY` is set.

## HTTP

`POST https://api.typesafe.ai/v1/systemone`, with `Authorization: Bearer $TYPESAFE_API_KEY`.

```json
{
  "model": "jev-latest",
  "state": "I was charged twice. Please fix this ASAP.",
  "questions": {
    "category": { "type": "choice", "instructions": "What is this ticket about?",
                  "criteria": { "billing": null, "technical": null, "other": "anything else" } },
    "urgent":   { "type": "noul", "instructions": "Does the customer need this today?",
                  "criteria": { "true": "optional description of yes", "false": "…of no" } },
    "severity": { "type": "score", "instructions": "How severe is it?",
                  "criteria": ["cosmetic", "annoying", "blocking", "money lost"] }
  }
}
```

- `state`: a string, JSON object, JSON array or `null`. **Structured state is
  fine.** Put lists of files, page elements or candidates straight in.
- `instructions` and criteria descriptions: a string, JSON or `null`. A `null`
  description leaves the label undescribed.
- `questions` must not be empty. Many questions in one request are answered
  together in one round trip.

Response:

```json
{
  "model": "jev-…",
  "answers": {
    "category": { "type": "choice", "choice": "billing", "confidence": 0.93,
                  "probabilities": { "billing": 0.93, "technical": 0.04, "other": 0.03 } },
    "urgent":   { "type": "noul", "noul": 0.81 },
    "severity": { "type": "score", "score": 2.6, "confidence": 0.55,
                  "legend": { "0": "cosmetic", "1": "annoying", "2": "blocking", "3": "money lost" },
                  "probabilities": { "0": 0.02, "1": 0.08, "2": 0.35, "3": 0.55 } }
  },
  "usage": { "input_tokens": 123, "output_tokens": 3 }
}
```

- `noul`: the probability of **yes**, from 0 to 1.
- `score.score` is the *expected* level, so it can fall between integers.
- The request id is in the `x-typesafe-request-id` header.
- `GET /v1/models` lists `{ name, description, release_date }`.

## JavaScript SDK

```js
import { TypeSafeClient, choice, noul, score } from "@typesafe-ai/sdk";

const client = new TypeSafeClient();              // reads TYPESAFE_API_KEY
const { answers, usage } = await client.systemOne({
  state: { document: "I was charged twice." },
  questions: {
    category: choice("What is this about?", { billing: null, technical: null, other: null }),
    urgent: noul("Is it urgent?"),
    severity: score("How severe?", ["low", "medium", "high"]),
  },
});
answers.category.choice; answers.urgent.noul; answers.severity.score;
```

- Helpers: `noul(instructions?, {true?, false?}?)`, `choice(instructions, {label: desc|null})`,
  `score(instructions, [desc0, desc1, ...])`.
- Client options: `apiKey`, `baseURL`, `defaultModel`, `timeout` (10 s per attempt),
  `retry` (2 retries on 408/429/5xx), `fetch` (custom transport), `logLevel`,
  `dangerouslyAllowBrowser` (off by default: keep the key on the server).
- Per-call options: `{ signal, timeout, retry, headers }`.
- `client.systemOne(...).withResponse()` gives `{ data, response, requestId }`.
- Errors: `BadRequestError` (400), `AuthenticationError` (401), `RateLimitError`
  (429, `retryAfterMs`), `APIConnectionError`, `APITimeoutError`, `APIUserAbortError`.
- `client.models.list()`.

Python SDK: `pip install typesafe-sdk`. Integrations exist for Pydantic AI,
LangChain, the Vercel AI SDK, LiteLLM and Cloudflare.

## Patterns used in this repo

1. **Gate, then act.** Put thresholds in code. Examples: `if (isCommand < 0.5) ignore`
   and `if (complete < 0.6) wait`.
2. **Point, don't write.** Put the candidates (page elements, files, sections,
   titles) in `criteria` and let Jev pick one. Your code does the action.
3. **Featurize.** Turn fuzzy text into a vector of `noul` probabilities, then fit
   an ordinary model (logistic regression) on top.
4. **Jev decides, the LLM writes.** Call Claude only after Jev has narrowed the
   context, or skip the call when Jev says the answer isn't there.
