// Offline stand-in for the Jev API.
//
// It speaks the exact wire format of `POST /v1/systemone` (see docs/jev-compressed.md),
// so every project runs end to end before you have an API key. It is NOT a model:
// it scores options by word overlap, which is enough to exercise the plumbing and
// the if-statements, but far dumber than real Jev. Set TYPESAFE_API_KEY to use Jev.
//
// Plugged into the official SDK through its `fetch` option, so the code path from
// `client.systemOne(...)` onwards is the same in mock and real mode.

const STOPWORDS = new Set(
  (
    "a an the and or but if of to in on at by for with from into onto about as is are was were be been being " +
    "it its this that these those there here i me my we our you your he she they them their what which who whom " +
    "do does did done can could should would will shall may might must not no yes so than then too very just " +
    "please um uh like okay ok hey now some any all up down"
  ).split(" "),
);
// Words kept even though they look like filler: they carry intent for browser commands.
const KEEP = new Set(["up", "down", "back", "forward"]);

// Utterances ending in one of these are probably unfinished ("click on the ...").
const DANGLING = new Set("a an the to on of for with into at and or my your this that".split(" "));

// When the state is an object, these keys hold the text being judged; the rest is context.
const FOCUS_KEYS = ["transcript", "utterance", "question", "new_fact", "title", "text", "document", "message"];

function stem(word) {
  return word.replace(/(ing|ed|es|s)$/u, "") || word;
}

export function words(text) {
  return (String(text ?? "").toLowerCase().match(/[\p{L}\p{N}.]+/gu) ?? [])
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter((w) => w && (KEEP.has(w) || !STOPWORDS.has(w)))
    .map(stem);
}

function flatten(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return value.map(flatten).join("\n");
  return Object.values(value).map(flatten).join("\n");
}

function splitState(state) {
  if (state && typeof state === "object" && !Array.isArray(state)) {
    const focus = FOCUS_KEYS.filter((k) => k in state);
    if (focus.length) {
      const rest = Object.fromEntries(Object.entries(state).filter(([k]) => !focus.includes(k)));
      return { query: focus.map((k) => flatten(state[k])).join("\n"), context: flatten(rest) };
    }
  }
  const text = flatten(state);
  return { query: text, context: text };
}

function overlap(queryWords, text) {
  const target = new Set(words(text));
  if (!target.size || !queryWords.length) return 0;
  let hits = 0;
  for (const w of queryWords) if (target.has(w)) hits += 1;
  return hits;
}

function softmax(scores, temperature = 0.6) {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - max) / temperature));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const round = (x) => Math.round(x * 1e4) / 1e4;

function answerChoice(question, queryWords) {
  const labels = Object.keys(question.criteria);
  const scores = labels.map((label) => {
    const desc = flatten(question.criteria[label]);
    // Exact label mention counts extra ("click the *search* button").
    return overlap(queryWords, `${label.replace(/[_-]/g, " ")} ${desc}`) + (overlap(queryWords, label) > 0 ? 0.5 : 0);
  });
  // A "none"/"other" style label wins when nothing matches.
  const fallback = labels.findIndex((l) => /^(none|other|unknown|no_match)$/i.test(l));
  if (fallback >= 0 && Math.max(...scores) === 0) scores[fallback] = 1;
  const probs = softmax(scores);
  let best = 0;
  probs.forEach((p, i) => {
    if (p > probs[best]) best = i;
  });
  return {
    type: "choice",
    choice: labels[best],
    confidence: round(probs[best]),
    probabilities: Object.fromEntries(labels.map((l, i) => [l, round(probs[i])])),
  };
}

function answerScore(question, queryWords) {
  const levels = question.criteria.map((c) => overlap(queryWords, flatten(c)));
  const probs = softmax(levels, 0.8);
  const expected = probs.reduce((acc, p, i) => acc + p * i, 0);
  let best = 0;
  probs.forEach((p, i) => {
    if (p > probs[best]) best = i;
  });
  return {
    type: "score",
    score: round(expected),
    confidence: round(probs[best]),
    legend: Object.fromEntries(question.criteria.map((c, i) => [String(i), c])),
    probabilities: Object.fromEntries(probs.map((p, i) => [String(i), round(p)])),
  };
}

function answerNoul(question, queryWords, rawQuery, context) {
  const yes = question.criteria?.true;
  const no = question.criteria?.false;
  let logit;
  if (yes != null || no != null) {
    // Which description does the text resemble more?
    logit = 1.2 * (overlap(queryWords, flatten(yes)) - overlap(queryWords, flatten(no)));
  } else {
    // No descriptions: "is the query supported by the context?" (share of query words found).
    const covered = overlap(queryWords, context) / Math.max(queryWords.length, 1);
    logit = 8 * (covered - 0.55);
  }
  const instructions = flatten(question.instructions).toLowerCase();
  if (/complete|finished|done speaking/.test(instructions)) {
    const tail = String(rawQuery).toLowerCase().trim().split(/\s+/).pop() ?? "";
    logit += DANGLING.has(tail) || rawQuery.trim().length < 4 ? -3 : 1.5;
  }
  return { type: "noul", noul: round(sigmoid(logit)) };
}

export function answerSystemOne(body) {
  const { query, context } = splitState(body.state);
  const queryWords = words(query);
  const answers = {};
  for (const [name, question] of Object.entries(body.questions ?? {})) {
    if (question.type === "choice") answers[name] = answerChoice(question, queryWords);
    else if (question.type === "score") answers[name] = answerScore(question, queryWords);
    else answers[name] = answerNoul(question, queryWords, query, context);
  }
  return {
    model: `${body.model ?? "jev-latest"} (offline mock)`,
    answers,
    usage: {
      input_tokens: Math.ceil(JSON.stringify(body).length / 4),
      output_tokens: Object.keys(answers).length,
    },
  };
}

/** A `fetch` implementation that answers TypeSafe API routes locally. */
export async function mockFetch(url, init = {}) {
  const { pathname } = new URL(url);
  const json = (status, data) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json", "x-typesafe-request-id": `mock-${Date.now()}` },
    });
  if (pathname.endsWith("/v1/systemone") && init.method === "POST") {
    return json(200, answerSystemOne(JSON.parse(init.body)));
  }
  if (pathname.endsWith("/v1/models")) {
    return json(200, [{ name: "jev-latest", description: "Offline mock of Jev", release_date: "2026-09-25" }]);
  }
  return json(404, { error: { message: `mock has no route for ${pathname}` } });
}
