// The "brain" of the voice browser, as the video explains it:
//
//   1. your words + a short list of what's on the page go to Jev,
//   2. Jev answers a fixed quiz (what does the user want? which element? which site?
//      is the sentence finished? are they even talking to the browser? is it destructive?),
//   3. plain code with thresholds decides what to do.
//
// No LLM anywhere in this loop, so it runs many times a second while you talk.
import { choice, noul } from "../../lib/jev.js";

export const INTENTS = {
  navigate: "open, go to or visit a website or web address",
  search: "search the web, look something up, google something",
  click: "click, open, follow, press or select a link or button that is on the current page",
  type: "type or enter text into an input field or search box",
  scroll_down: "scroll down, go further down the page, show more",
  scroll_up: "scroll up, go back to the top of the page",
  back: "go back to the previous page, undo navigation",
  forward: "go forward to the next page in history",
  reload: "refresh or reload the page",
  none: "not a browser action",
};

// Sites the user can name without saying the domain ("open wikipedia").
export const SITES = {
  wikipedia: { url: "https://www.wikipedia.org", desc: "Wikipedia, the free encyclopedia" },
  youtube: { url: "https://www.youtube.com", desc: "YouTube videos" },
  github: { url: "https://github.com", desc: "GitHub code hosting" },
  hackernews: { url: "https://news.ycombinator.com", desc: "Hacker News, Y Combinator news" },
  reddit: { url: "https://www.reddit.com", desc: "Reddit" },
  duckduckgo: { url: "https://duckduckgo.com", desc: "DuckDuckGo search engine" },
  maps: { url: "https://www.openstreetmap.org", desc: "maps, directions, OpenStreetMap" },
  mdn: { url: "https://developer.mozilla.org", desc: "MDN web docs, JavaScript and CSS documentation" },
  other: { url: null, desc: "some other website, or no website mentioned" },
};

// The if-statement thresholds. Tune these while watching the dashboard log.
export const THRESHOLDS = {
  isCommand: 0.7, // below: the user is talking to someone else → ignore
  complete: 0.6, // below: sentence not finished yet → wait for more words
  intent: 0.35, // below: not sure what they want → ignore
  target: 0.25, // below: not sure which element → ask to clarify
  site: 0.4, // below: don't trust the named-site guess
  destructive: 0.5, // above: buy/delete/send → require a confirmation click
};

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

/** Describe each page element so it can be picked as a `choice` label. */
export function elementCriteria(elements) {
  const counters = {};
  const criteria = {};
  for (const el of elements) {
    counters[el.role] = (counters[el.role] ?? 0) + 1;
    const n = counters[el.role];
    const ordinal = n <= ORDINALS.length ? `${ORDINALS[n - 1]} ${el.role}, ` : "";
    criteria[el.id] = `${ordinal}${el.role} #${n}: "${el.text}"`;
  }
  criteria.none = "none of the elements on the page";
  return criteria;
}

export function buildState({ transcript, page }) {
  return {
    transcript,
    current_page: { url: page.url, title: page.title },
    // The list Jev points into. The same text is in `target`'s criteria, but seeing it
    // as page context helps with "the link under the heading" style references.
    page_elements: page.elements.map((el) => `${el.role}: ${el.text}`),
  };
}

export function buildQuestions({ page }) {
  const questions = {
    is_command: noul("Is the speaker giving an instruction to their web browser, rather than talking to someone else?", {
      true: "an instruction for the browser: open, go to, click, scroll, search, type, go back, reload",
      false: "talking to another person in the room, thinking out loud, small talk",
    }),
    complete: noul("Is the spoken instruction complete, or is the speaker still in the middle of the sentence?", {
      true: "a finished instruction with its object, like 'go to wikipedia', 'click the history link', 'scroll down'",
      false: "an unfinished fragment that trails off, like 'click on the', 'go to', 'search for'",
    }),
    intent: choice("What does the user want the browser to do?", INTENTS),
    site: choice(
      "Which website does the user want to open?",
      Object.fromEntries(Object.entries(SITES).map(([key, site]) => [key, site.desc])),
    ),
    destructive: noul("Would carrying out this instruction buy, delete, send, post or submit something that can't be undone?", {
      true: "buy, purchase, checkout, pay, delete, remove, send, post, publish, submit, unsubscribe",
      false: "reading, browsing, scrolling, opening pages, searching",
    }),
  };
  // Only ask "which element?" when there is something to point at.
  if (page.elements.length) {
    questions.target = choice("Which element on the current page is the user referring to?", elementCriteria(page.elements));
  }
  return questions;
}

const DOMAIN = /\b((?:[a-z0-9-]+\.)+(?:com|org|net|io|ai|dev|co|edu|gov|app|de|nl|uk|fr|jp)(?:\/\S*)?)\b/i;

/** Text after "search for …" / "type …" — code extracts it, Jev doesn't write text. */
export function extractText(transcript, intent) {
  const t = transcript.trim().replace(/[.!?]+$/, "");
  if (intent === "search") {
    const m = t.match(/(?:search(?:\s+the\s+web)?(?:\s+for)?|look\s+up|google)\s+(.+)/i);
    return m?.[1] ?? null;
  }
  if (intent === "type") {
    const m = t.match(/(?:type|enter|write)\s+(.+?)(?:\s+(?:in|into)\s+the\s+[\w\s]+)?$/i);
    return m?.[1]?.replace(/^["']|["']$/g, "") ?? null;
  }
  return null;
}

function resolveUrl(transcript, siteAnswer) {
  const domain = transcript.match(DOMAIN)?.[1];
  if (domain) return /^https?:/.test(domain) ? domain : `https://${domain}`;
  if (siteAnswer.choice !== "other" && siteAnswer.confidence >= THRESHOLDS.site) return SITES[siteAnswer.choice].url;
  // "go to the weather in Amsterdam" → fall back to a search.
  const rest = transcript.replace(/^.*?\b(?:go to|open|visit|navigate to)\s+/i, "").trim();
  return rest ? `https://duckduckgo.com/?q=${encodeURIComponent(rest)}` : null;
}

/**
 * Turn Jev's probabilities into one decision. Pure function: easy to test and tune.
 * Returns { action: "ignore" | "wait" | "clarify" | "confirm" | "execute", reason, command? }.
 */
export function decide({ transcript, answers, page, isFinal = false }) {
  const { is_command, complete, intent, target, site, destructive } = answers;

  if (is_command.noul < THRESHOLDS.isCommand) {
    return { action: "ignore", reason: `not talking to the browser (${fmt(is_command.noul)})` };
  }
  // A final transcript means the speaker paused, so treat it as complete.
  if (!isFinal && complete.noul < THRESHOLDS.complete) {
    return { action: "wait", reason: `sentence not finished (${fmt(complete.noul)})` };
  }
  if (intent.choice === "none" || intent.confidence < THRESHOLDS.intent) {
    return { action: "ignore", reason: `unclear intent (${intent.choice} ${fmt(intent.confidence)})` };
  }

  let command;
  switch (intent.choice) {
    case "navigate": {
      const url = resolveUrl(transcript, site);
      if (!url) return { action: "clarify", reason: "which website?" };
      command = { type: "navigate", url };
      break;
    }
    case "search": {
      const query = extractText(transcript, "search");
      if (!query) return { action: "wait", reason: "search for what?" };
      command = { type: "navigate", url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}` };
      break;
    }
    case "click":
    case "type": {
      if (!target || target.choice === "none" || target.confidence < THRESHOLDS.target) {
        if (!target) return { action: "clarify", reason: "there is nothing to click on this page" };
        return { action: "clarify", reason: `which element? best guess ${describe(page, target)}` };
      }
      command = { type: intent.choice, elementId: target.choice, label: describe(page, target) };
      if (intent.choice === "type") {
        const text = extractText(transcript, "type");
        if (!text) return { action: "wait", reason: "type what?" };
        command.text = text;
      }
      break;
    }
    default:
      command = { type: intent.choice }; // scroll_down, scroll_up, back, forward, reload
  }

  if (destructive.noul >= THRESHOLDS.destructive) {
    return { action: "confirm", reason: `might be irreversible (${fmt(destructive.noul)})`, command };
  }
  return { action: "execute", reason: `${intent.choice} (${fmt(intent.confidence)})`, command };
}

function describe(page, target) {
  const el = page.elements.find((e) => e.id === target.choice);
  return el ? `${el.role} "${el.text}" (${fmt(target.confidence)})` : `none (${fmt(target.confidence)})`;
}

const fmt = (p) => `${Math.round(p * 100)}%`;
