# Jev follow-along: prompts and concepts, step by step

This guide follows the video "Jev: The New AI Model That's Breaking The Internet
(Full Tutorial)". Each step has four parts:

- 🎯 **Goal**: what you'll have at the end
- 🧠 **Knowledge**: the ideas behind it, so you understand what the code does
- 💬 **Prompt**: text to paste into your AI coding assistant (Claude Code, Cursor, …)
- ✅ **Checkpoint**: how to tell it worked, plus a small exercise

**How to use it:** open an empty folder, work through the steps in order, and
paste each prompt yourself. This repo has a reference solution for every step
(the "Compare with" line), so you can check your result or get unstuck.

> Note on the name: the auto-generated captions say "Jeff". The model is **Jev**
> by TypeSafe AI (typesafe.ai).

---

## Step 0: Understand what Jev is (no code)

🎯 **Goal:** be able to explain, in your own words, when to use Jev and when to use an LLM.

🧠 **Knowledge**

1. **An LLM generates. Jev decides.** An LLM like ChatGPT or Claude writes its answer one token at
   a time, so a long answer takes seconds (the video's example took 8.5 s). Jev
   never writes. You give it a **state** (text or JSON) and some **typed
   questions**, and it returns **probabilities** for answers you defined in
   advance. The answer to "Is this invoice fraud?" is
   `{fraud: 0.04, clean: 0.88, review: 0.08}`, not a paragraph.
2. **Why this is fast and cheap.** There is no step-by-step text generation.
   Every question is answered in one pass, in a few hundred milliseconds. The
   video's claim is 20–200× faster and 40–400× cheaper.
3. **The three question types:**
   | Type | Question | Answer |
   |---|---|---|
   | `noul` | yes/no | `noul: 0.81` (the probability of yes) |
   | `choice` | pick one of N labels | `choice`, `confidence`, `probabilities{label: p}` |
   | `score` | a level on an ordered rubric (2 or more levels) | `score` (the expected level, e.g. 2.6), `probabilities` |
4. **Software is full of if-statements.** Route this ticket, flag this invoice,
   click this link. Those are the decisions Jev makes. **Your code** keeps the
   thresholds (`if (p < 0.5) ignore`), so the behavior stays predictable and easy
   to tune.
5. **The trade-off.** Jev can pick, classify, score, rank and route. It cannot
   write a sentence, explain itself, write code or reason step by step. So the
   pattern is: **Jev decides what needs to happen, and an LLM writes only when
   text is needed.**

✅ **Checkpoint:** list three if-statements in software you know that Jev could
answer. For each one, is it a `noul`, a `choice` or a `score`?

---

## Step 1: Set up the project and API key

🎯 **Goal:** a Node project with your key in `.env` and a compressed copy of the Jev docs your assistant can read.

🧠 **Knowledge**

- **API keys go in `.env`**, which is never committed (it's listed in
  `.gitignore`). `.env.example` shows which variables exist, without values.
- **Keep the key on the server.** The Jev SDK refuses to run in a browser unless
  you set `dangerouslyAllowBrowser`, because anyone who opens the page could read
  the key. That's why every project here has a small Node server.
- **Compressed docs** (the video's first prompt): your coding assistant writes
  better code when an accurate API summary is inside the project, instead of it
  guessing from memory or browsing each time.
- Access, two ways:
  - **TypeSafe:** typesafe.ai → join the waitlist → console → **API keys**. The
    console also has a playground where you can try questions by hand. Put the key
    in `TYPESAFE_API_KEY`.
  - **OpenRouter:** an `sk-or-…` key from openrouter.ai/keys, plus prepaid
    credits. Put it in `OPENROUTER_API_KEY`. OpenRouter serves the same API at
    `https://openrouter.ai/api/v1/systemone`, with the model `typesafe/jev-1.13`.
  - **Vercel AI Gateway:** a `vck_…` key. Put it in `AI_GATEWAY_API_KEY`. The
    gateway speaks the same API at `https://ai-gateway.vercel.sh/typesafe`, with
    the model `typesafe-ai/jev`, so the same SDK works once you change `baseURL`.
- **Real keys go in `.env`, never in `.env.example`.** `.env.example` is committed
  and shared. If you paste a key there, GitHub's secret scanning blocks the
  commit. If a key ever does get committed, revoke it and create a new one.

💬 **Prompt**
```text
Create a Node.js (20+) project with ES modules. Install @typesafe-ai/sdk, express and dotenv.
Create .env.example with TYPESAFE_API_KEY, OPENROUTER_API_KEY, AI_GATEWAY_API_KEY (Vercel) and ANTHROPIC_API_KEY
(all empty), and a .gitignore that
excludes node_modules and .env.

Then read the Jev documentation (https://docs.typesafe.ai, and the @typesafe-ai/sdk README and
type definitions in node_modules) completely, and save a compressed version to
docs/jev-compressed.md. We will be working with this model in this project, so I want you to
know everything about it: endpoint, auth, request/response JSON, the noul/choice/score question
types, SDK helpers, client options and error types. My API key is in .env as TYPESAFE_API_KEY.
```

✅ **Checkpoint:** `docs/jev-compressed.md` explains `state`, `questions`, and
all three answer shapes. **Exercise:** in the TypeSafe console playground, ask
one `choice` question about a sentence you write yourself.

Compare with: `package.json`, `.env.example`, `docs/jev-compressed.md`

---

## Step 2: One shared Jev helper and an offline mock

🎯 **Goal:** one function, `ask(state, questions)`, used by all three projects, which also works without a key.

🧠 **Knowledge**

- **Put the API behind one small wrapper.** It's one place to add timing,
  logging and mode switching.
- **Test double / mock:** a fake that speaks the same format as the real API
  (`POST /v1/systemone`). You can build and test everything while you wait for
  access, and tests don't cost money. The SDK accepts a custom `fetch`, so the
  mock plugs in underneath it and the rest of your code doesn't change.
- A mock is **not a model.** Ours matches overlapping words, which is enough to
  test the plumbing but much dumber than Jev. Judge quality only with the real
  key.
- **Measure latency** on every call. Speed is the reason to use Jev.

💬 **Prompt**
```text
Read docs/jev-compressed.md. Create lib/jev.js exporting createJev(), which returns
{ mode, ask(state, questions) }. ask() calls client.systemOne and returns the answers plus
usage and latencyMs. Re-export the choice/noul/score helpers from the SDK.

Pick the backend from the environment: TYPESAFE_API_KEY → TypeSafe directly;
OPENROUTER_API_KEY → OpenRouter (same SDK, baseURL https://openrouter.ai/api, model typesafe/jev-1.13);
AI_GATEWAY_API_KEY → Vercel AI Gateway (same SDK, baseURL https://ai-gateway.vercel.sh/typesafe,
model typesafe-ai/jev); neither, or JEV_MOCK=1 → an offline mock. Write lib/mock-jev.js
as a fetch() implementation passed to TypeSafeClient's `fetch` option. It answers
POST /v1/systemone in the exact response format, scoring options by word overlap between the
state and each label's description (softmax for choice/score, sigmoid for noul). Explain in a
comment that the mock is for plumbing, not quality.
```

✅ **Checkpoint:** run a quick script that asks
`choice("What is this about?", {billing: null, technical: null, other: null})`
about "I was charged twice". You should get `billing` with its probabilities.
**Exercise:** ask a `score` question and explain why `score` can be 1.79 rather
than a whole number.

Compare with: `lib/jev.js`, `lib/mock-jev.js`

---

## Step 3: Project 1, a voice-controlled web browser

🎯 **Goal:** you say "go to wikipedia.org", "click the first link", "scroll down", "go back", and a real browser window does it in real time.

🧠 **Knowledge**

The pipeline, as the video explains it:
```
mic → speech-to-text (live) → server snapshots the page (≤100 elements)
    → Jev quiz (one request) → if-statements with thresholds → Playwright acts
```
1. **Speech-to-text:** Chrome's Web Speech API sends **interim** results while
   you're still talking, then a **final** result when you pause. We send both to
   the server.
2. **The page as a list:** the server reads the visible links, buttons and
   inputs, gives each an id (`e0`, `e1`, …), and puts them in the `criteria` of
   a `choice` question. **Jev points at an element instead of writing a CSS
   selector.**
3. **The quiz**, one request with six questions:
   - `is_command` (noul): are you talking to the browser, or to someone in the room?
   - `complete` (noul): is the sentence finished?
   - `intent` (choice): navigate, search, click, type, scroll, back, …
   - `target` (choice): which element on the page?
   - `site` (choice): which known website?
   - `destructive` (noul): would this buy, delete or send something?
4. **Plain code decides.** For example: `is_command < 0.5 → ignore`,
   `complete < 0.6 → wait for more words`, `destructive ≥ 0.5 → ask for a
   confirmation click`. The **thresholds are your tuning knobs.**
5. **Why it can react before you finish talking:** Jev runs on every interim
   fragment. As soon as `complete` crosses the threshold, it acts. In the video,
   "go back" fired mid-sentence. An LLM that has to reason for seconds can't do
   this.
6. **Jev doesn't write text,** so code extracts it. For example, the query after
   "search for …" comes from a regex.
7. **Race conditions:** a newer fragment can arrive while an older request is
   still running. Handle each utterance at most once, and throw away stale
   answers.

💬 **Prompt** (the video's prompt, made more specific)
```text
I want you to build an app using the Jev API (see docs/jev-compressed.md and lib/jev.js).
It should be a web app where I can speak into it. It automatically transcribes what I say and
controls a web browser for me in real time, so I can say "open wikipedia.org", "click on the
first link", "scroll down", "go back".

Architecture:
- projects/01-voice-browser/browser.js: Playwright launches a visible Chromium. snapshot() returns
  url, title, and up to 100 visible links/buttons/inputs (on-screen first), tagging each with a
  data-jev-id. execute(command) does navigate/click/type/scroll/back/forward/reload.
- decide.js: builds ONE Jev request with these questions: is_command (noul), complete (noul),
  intent (choice), target (choice over page elements), site (choice over known sites),
  destructive (noul). Then a pure decide() function applies thresholds in plain code:
  ignore / wait / clarify / confirm / execute. No LLM in this loop.
- server.js (express): POST /api/utterance {utteranceId, seq, text, isFinal} → snapshot → Jev →
  decide → execute. Act at most once per utterance, and drop stale responses. POST /api/confirm
  for destructive actions.
- public/index.html: Start/Stop mic using the Web Speech API with interimResults, a text box
  fallback, and a live log showing each fragment, the decision, latency and Jev's probabilities.
```

✅ **Checkpoint:** `npm run voice`, open the dashboard in Chrome, click
**Start mic** and say "go to wikipedia.org". **Exercises:**
- Say "hey, what should we have for dinner?". It should be *ignored*.
- Watch the log while you speak slowly. When does `complete` pass 0.6?
- Change `THRESHOLDS.complete` to 0.9. What happens to the speed?
- Ask your assistant: *"Can you explain in very simple terms how this actually works?"*
  (the video does this too).

Compare with: `projects/01-voice-browser/` (server and dashboard still to be written)

---

## Step 4: Project 2, a faster, cheaper memory system

🎯 **Goal:** ask a question about a folder of markdown notes. Jev finds the right section first, and the LLM reads only that section, or nothing if the answer isn't there.

🧠 **Knowledge**

1. **The problem (the video's "Claudia OS"):** a folder of daily memory files.
   To answer "what did we decide about the CRM?", an agent guesses from file
   names and **reads whole files**. That costs thousands of tokens (the video
   saw ~13,000 per question) and it can still miss. Writing is worse: the agent
   doesn't know *where* a new fact belongs, so it appends everything to today's
   file.
2. **This is retrieval** (the "R" in RAG). The usual tool is embeddings and
   vector search. Here, Jev does the retrieval by answering questions:
   - **Gate:** `noul` "Does this memory contain the answer?" If it's low, stop.
     **Zero LLM tokens** (the video's "Morris's favorite pizza topping").
   - **Route:** `choice` over the files, then `choice` over the sections of the
     top files.
   - **Answer:** Claude reads only the chosen sections (a few hundred tokens,
     not 13,000).
3. **Code does the counting, chunking and diffing.** Split files into sections
   by `##` headings, and count tokens in code. Jev makes only the small semantic
   decisions ("a judgment engine, not a writer").
4. **The write path:** a new fact goes through `choice` (which file and section?)
   and `noul` (is it already there? does it contradict something?). Then code
   appends it in the right place, or skips the duplicate.
5. **The metric:** tokens the LLM reads with Jev, vs. reading everything.
   Savings = `1 − jev_tokens / naive_tokens` (the video showed 80–98%).

💬 **Prompt** (the video's prompt, adapted)
```text
Look into the memory system in projects/02-memory/sample-memory (create ~12 realistic sample
daily notes plus a few topic files first, clearly marked as sample data; later I'll point
MEMORY_DIR at my own notes). Come up with ways to improve the memory system using Jev, build the
improvements, and build a dashboard to demo exactly what improved.

Recall: index files into sections by heading (code). Jev request 1: noul "does memory contain the
answer?" + choice over files. If the answer is unlikely, return "not in memory" with 0 LLM tokens.
Jev request 2: choice over the sections of the top files. Then Claude (lib/claude.js, optional)
answers using ONLY the chosen sections. Without a Claude key, show the sections themselves.
Show: LLM tokens used vs reading all memory, % saved, cost, Jev latency.

Write: given a new fact, Jev picks the file+section (or "new daily note"), and noul checks for
duplicate/contradiction. Preview the change, then apply it on click.
Dashboard tabs: Recall (with example questions), Write, Index.
```

✅ **Checkpoint:** try the video's three questions: *current offer positioning*,
*what broke between the CRM and the email provider*, and *a favorite pizza
topping* (the last should be "missing" with 0 tokens). **Exercise:** find a
question where the gate wrongly says "missing". Would a better instruction or a
different threshold fix it?

Compare with: `projects/02-memory/` (to be written)

---

## Step 5: Project 3, a YouTube topic and title predictor

🎯 **Goal:** type a title, a thumbnail idea and a length, and get a breakout probability with the reasons. Then let an LLM brainstorm 15 titles and have Jev rank them.

🧠 **Knowledge**

1. **Featurization:** Jev turns fuzzy text into numbers. For each title it
   answers yes/no questions such as "is it a course or training?", "a live
   event?", "a curiosity gap?", "a specific promised outcome?", "does it name a
   tool?". Each `noul` probability becomes one feature. We add plain code
   features too: duration, title length, a number or year in the title.
2. **Label:** raw views are unfair, because big channels always win. Use
   **outperformance**: views ÷ that channel's median. A video counts as a
   "breakout" if it's ≥ ~1.5× its channel's median.
3. **Model: logistic regression.** A weighted sum of features goes through a
   sigmoid to give a probability. Standardize the features first, so the
   **weights double as "feature importance"**, the video's chart where duration
   and "course/training" ranked high.
4. **Evaluate honestly.** Train on 80% of the videos and test on the held-out
   20% (accuracy, AUC). Importance means *correlation in this niche*, not
   causation, and 600 videos is a small dataset.
5. **Score my title:** featurize → predict → show the drivers (the features
   pushing up vs. down). In the video, `< 0.5` means "underperformer".
6. **Generate, then rank** (the video's "ID8" tab). The LLM **writes** 15
   candidate titles and thumbnails. Jev **featurizes** them, and the model
   **ranks** them. A last Jev `choice` over the top 5 asks "which would a viewer
   click?" and "which is most honest?", a sanity pass against clickbait.

💬 **Prompt**
```text
Build a tool that predicts whether a YouTube topic/title will do well, using Jev.
- Data: fetch-youtube.js uses YOUTUBE_API_KEY to fetch ~40 recent videos from each channel
  listed in data/channels.json (title, duration, views, publish date, live flag). Also
  make-sample-data.js, which generates a clearly-labelled SYNTHETIC dataset (600 videos,
  15 channels) so I can practice without a key.
- Label: breakout = views >= 1.5 x the channel's median views.
- Features: code features (log duration, title length, has number/year, question mark) + Jev
  noul features per title (course/training, live event, tutorial, news, curiosity gap, specific
  outcome, names a tool, beginner-friendly, hype). Cache Jev answers on disk, with limited
  concurrency.
- train.js: standardized logistic regression, 80/20 split, report accuracy + AUC, save the
  model and feature importance.
- Dashboard: Dataset stats, Feature importance, "Score my title" (title, thumbnail concept,
  minutes → probability, verdict, top drivers up/down), and "Ideate": Claude writes N
  title+thumbnail candidates for a topic (template fallback without a key), Jev featurizes,
  the model ranks them, then a final Jev choice over the top 5: "which would a viewer click?"
  and "which is most honest?".
```

✅ **Checkpoint:** score *"The only ChatGPT course you need in 2026 (2 hours)"*
at 120 minutes, and *"What is Jev"* at 20 minutes. The first should come out
much higher. **Exercise:** remove one Jev feature, retrain, and see whether the
test AUC drops. That's how you learn which questions actually help.

Compare with: `projects/03-youtube/` (to be written)

---

## Step 6: Tests, README, commit

🎯 **Goal:** tests you can run for free on every change, and a repo someone else can run.

🧠 **Knowledge**

- **Test the pure logic.** `decide()` in project 1 takes probabilities and
  returns an action, so you can test every threshold path without a browser or
  an API.
- **Run the tests against the mock** (`JEV_MOCK=1`). They're free and give the
  same result every time.
- **The README** is the setup a newcomer needs: install, keys, one command per
  project.

💬 **Prompt**
```text
Add tests with node:test (run with JEV_MOCK=1): decide() threshold paths for the voice browser
(ignore, wait, clarify, confirm, execute), memory recall returning "missing" with 0 tokens for an
unrelated question, and logistic regression learning a simple synthetic rule. Write a README with
setup, keys, and one command per project. Then commit.
```

✅ **Checkpoint:** `npm test` passes, and a fresh clone runs with `npm install` and `npm run voice`.

---

## Where we are in this repo

| Step | Status |
|---|---|
| 0 Concepts | ✅ this guide |
| 1 Setup + compressed docs | ✅ done |
| 2 Shared Jev helper + mock | ✅ done |
| 3 Voice browser | 🟡 brain (`decide.js`) + browser control done; server and dashboard next |
| 4 Memory | ⬜ next |
| 5 YouTube predictor | ⬜ next |
| 6 Tests + README | ⬜ next |
