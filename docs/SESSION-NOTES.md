# Session notes (handoff)

Read this first when starting a new conversation about this repo. It's the short version of
everything learned so far. The step-by-step guide is `docs/FOLLOW-ALONG.md`, and the Jev API
summary is `docs/jev-compressed.md`.

## Who / how
- The learner follows the video "Jev: The New AI Model That's Breaking The Internet" (the
  auto-captions say "Jeff"; the model is **Jev** by TypeSafe AI).
- They want to **learn**: give a copy-paste prompt for each step, plus the concepts behind it.
  Explain in **English and Thai**. Keep terminal instructions exact and one command per block.
- Machine: macOS, **Antigravity IDE** with its terminal, Claude Code (`claude`) in a terminal tab,
  Google Chrome for the dashboard. The project lives at `~/Desktop/jev-follow-along`.
- Branch: `claude/jev-project-follow-along-muzxll`. Always run `git pull` before starting.

## Setup facts
- Jev runs through **OpenRouter**: `OPENROUTER_API_KEY` is in `.env` (never in `.env.example`).
  Model `typesafe/jev-1.13` works. `npm run check` confirms the connection.
- `lib/jev.js` picks the backend: TYPESAFE_API_KEY → OpenRouter → Vercel → offline mock.
- `.gitignore` ignores `.env` and `.env.*` (nano leaves `.env.save` backups), except `.env.example`.

## Terminal layout that works
```
Terminal A (node)  → npm run voice          → server; don't type here
Terminal B (zsh)   → tests, git             → say "…" helper lives here
Terminal C         → claude (Claude Code)   → paste prompts here
```
Test helper for Terminal B (needs a unique id per call; zsh's $RANDOM repeats inside pipes):
```bash
say() { SAY_N=$((SAY_N+1)); curl -sS -X POST localhost:3001/api/utterance -H 'content-type: application/json' -d "{\"utteranceId\":\"u$$-$SAY_N\",\"seq\":1,\"text\":\"$1\",\"isFinal\":${2:-true}}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let r;try{r=JSON.parse(s)}catch{return console.log("RAW:",s||"(empty reply)")}if(!r.action)return console.log("RAW:",s);const a=r.answers||{};console.log(`→ ${r.action} | ${r.reason??r.error??r.message??""} | ${r.latencyMs??"?"} ms | ${r.page?.url??""}`);if(r.answers)console.log(`  is_command=${a.is_command?.noul} complete=${a.complete?.noul} destructive=${a.destructive?.noul} intent=${a.intent?.choice}(${a.intent?.confidence}) target=${a.target?.choice} site=${a.site?.choice}`)})'; }
```

## Progress
| Step | Status |
|---|---|
| 0–2 Concepts, setup, shared Jev client + mock | ✅ |
| 3 Voice browser (`projects/01-voice-browser`) | ✅ works by voice with real Jev, 300–600 ms per decision |
| 4 Memory (`projects/02-memory`) | ⬜ **next**: prompt is in FOLLOW-ALONG.md, step 4 |
| 5 YouTube predictor (`projects/03-youtube`) | ⬜ |
| 6 Tests + README | ⬜ |

## Lessons from step 3 (worth reusing)
- **Jev judges, code decides.** "honey, can you scroll down the dishes?" got `is_command` 0.51,
  so it passed a 0.5 threshold. The learner raised `THRESHOLDS.isCommand` to **0.7** to fix it.
  Jev's numbers vary slightly between calls (0.51 vs 0.52), so leave a margin.
- Gate order matters: "buy this now" was ignored by `is_command` (0.20) before `destructive` ran.
- Known small dashboard glitch: a late interim reply can overwrite an executed row's reason.
- Pitfalls hit: wrong folder (`~` vs project), key in `.env.example`, Thai keyboard adding `ฯ`,
  `#` comments break zsh commands, example output pasted as commands, two servers on port 3001
  (`lsof -ti :3001 | xargs kill`), push rejected until `git pull --no-rebase --no-edit`.
- Optional extension discussed: a Jev-guided crawler (`crawl.js`), with Jev deciding relevance
  and next links and code extracting the data. Be polite: delays, page limits, robots.txt.
