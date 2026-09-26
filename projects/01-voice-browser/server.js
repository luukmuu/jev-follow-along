// Voice browser server: connects speech transcripts → Jev decisions → browser actions.
import express from "express";
import { createJev } from "../../lib/jev.js";
import { launchBrowser } from "./browser.js";
import { buildState, buildQuestions, decide, THRESHOLDS } from "./decide.js";

const PORT = process.env.PORT || 3001;

// Track which utterances already triggered a browser action (avoid re-executing on late transcripts).
const handledUtterances = new Set();

// Latest seq number for each utteranceId (newer transcripts invalidate older ones).
const latestSeq = new Map();

// One browser action at a time (Playwright commands like click or navigate don't overlap).
let browserLock = Promise.resolve();

// When a destructive command requires confirmation, store it here.
let pendingConfirm = null;

const jev = createJev();
console.log(`Jev mode: ${jev.mode}`);

const browser = await launchBrowser({ startUrl: "https://www.wikipedia.org" });
console.log("Browser launched");

const app = express();
app.use(express.json());
app.use(express.static("projects/01-voice-browser/public"));

app.post("/api/utterance", async (req, res) => {
  const { utteranceId, seq, text, isFinal } = req.body;

  // Already executed a command for this utteranceId → don't re-run.
  if (handledUtterances.has(utteranceId)) {
    return res.json({ action: "done" });
  }

  // Track that this is the latest transcript we've seen for this utteranceId.
  latestSeq.set(utteranceId, seq);

  const page = await browser.snapshot();
  const started = performance.now();
  const result = await jev.ask(buildState({ transcript: text, page }), buildQuestions({ page }));

  // A newer transcript for the same utteranceId arrived while Jev was thinking → discard this one.
  if (latestSeq.get(utteranceId) !== seq) {
    return res.json({ action: "stale" });
  }

  const decision = decide({ transcript: text, answers: result.answers, page, isFinal });

  if (decision.action === "execute") {
    // Run browser commands one at a time (lock prevents overlapping clicks/navigations).
    browserLock = browserLock.then(async () => {
      try {
        await browser.execute(decision.command);
      } catch (err) {
        // Browser action failed (element not found, navigation timeout, etc.) → report but don't crash.
        return res.json({
          action: "error",
          reason: err.message,
          latencyMs: Math.round(performance.now() - started),
          mode: jev.mode,
        });
      }
    });
    await browserLock;
    handledUtterances.add(utteranceId);
  }

  if (decision.action === "confirm") {
    pendingConfirm = decision.command;
  }

  res.json({
    action: decision.action,
    reason: decision.reason,
    command: decision.command,
    latencyMs: result.latencyMs,
    mode: jev.mode,
    answers: compactAnswers(result.answers),
    page: { url: page.url, title: page.title, elementCount: page.elements.length },
  });
});

app.post("/api/confirm", async (req, res) => {
  if (!pendingConfirm) {
    return res.json({ success: false, reason: "nothing to confirm" });
  }
  const command = pendingConfirm;
  pendingConfirm = null;

  try {
    browserLock = browserLock.then(() => browser.execute(command));
    await browserLock;
    res.json({ success: true, command });
  } catch (err) {
    res.json({ success: false, reason: err.message });
  }
});

app.get("/api/status", async (req, res) => {
  const page = await browser.snapshot();
  res.json({
    mode: jev.mode,
    url: page.url,
    title: page.title,
    thresholds: THRESHOLDS,
  });
});

const server = app.listen(PORT, () => {
  console.log(`Dashboard: http://localhost:${PORT}`);
});

// Ctrl+C: close the browser before exiting.
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await browser.close();
  server.close();
  process.exit(0);
});

/** Turn Jev's verbose answers into compact dashboard-friendly summaries. */
function compactAnswers(answers) {
  const compact = {};
  for (const [key, answer] of Object.entries(answers)) {
    if (answer.type === "noul") {
      compact[key] = { noul: Math.round(answer.noul * 100) / 100 };
    } else if (answer.type === "choice") {
      const top3 = Object.entries(answer.probabilities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label, p]) => [label, Math.round(p * 100) / 100]);
      compact[key] = {
        choice: answer.choice,
        confidence: Math.round(answer.confidence * 100) / 100,
        top3,
      };
    } else if (answer.type === "score") {
      compact[key] = {
        score: Math.round(answer.score * 100) / 100,
        confidence: Math.round(answer.confidence * 100) / 100,
      };
    }
  }
  return compact;
}
