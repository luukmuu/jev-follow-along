// The controlled browser window (Playwright), plus the "short list of what's on the page".
import { chromium } from "playwright";

const MAX_ELEMENTS = 100;

export async function launchBrowser({ startUrl = "about:blank" } = {}) {
  const browser = await chromium.launch({
    headless: process.env.HEADLESS === "1",
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const context = await browser.newContext({ viewport: { width: 1200, height: 850 } });
  let page = await context.newPage();
  // Follow links that open in a new tab.
  context.on("page", (newPage) => {
    page = newPage;
  });
  if (startUrl !== "about:blank") await page.goto(startUrl).catch(() => {});

  /** Up to 100 visible links/buttons/inputs, the ones on screen first. Tags each with data-jev-id. */
  async function snapshot() {
    const elements = await page
      .evaluate((max) => {
        const selector = 'a[href], button, input:not([type=hidden]), textarea, select, [role=button], [role=link], [role=tab], [role=menuitem]';
        const seen = new Set();
        const items = [];
        for (const node of document.querySelectorAll(selector)) {
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          if (!rect.width || !rect.height || style.visibility === "hidden" || style.display === "none") continue;
          const text = (
            node.innerText ||
            node.getAttribute("aria-label") ||
            node.getAttribute("placeholder") ||
            node.getAttribute("title") ||
            node.getAttribute("alt") ||
            node.value ||
            node.querySelector("img[alt]")?.getAttribute("alt") ||
            ""
          )
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80);
          if (!text) continue;
          const tag = node.tagName.toLowerCase();
          const role = tag === "a" || node.getAttribute("role") === "link" ? "link" : ["input", "textarea", "select"].includes(tag) ? "input" : "button";
          const key = `${role}|${text}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const onScreen = rect.bottom > 0 && rect.top < innerHeight;
          items.push({ node, role, text, onScreen, top: rect.top + scrollY });
        }
        items.sort((a, b) => Number(b.onScreen) - Number(a.onScreen) || a.top - b.top);
        return items.slice(0, max).map((item, i) => {
          item.node.setAttribute("data-jev-id", `e${i}`);
          return { id: `e${i}`, role: item.role, text: item.text };
        });
      }, MAX_ELEMENTS)
      .catch(() => []);
    return { url: page.url(), title: await page.title().catch(() => ""), elements };
  }

  async function execute(command) {
    switch (command.type) {
      case "navigate":
        await page.goto(command.url, { waitUntil: "domcontentloaded" });
        break;
      case "click":
        await page.locator(`[data-jev-id="${command.elementId}"]`).first().click({ timeout: 5000 });
        break;
      case "type": {
        const field = page.locator(`[data-jev-id="${command.elementId}"]`).first();
        await field.fill(command.text, { timeout: 5000 });
        await field.press("Enter");
        break;
      }
      case "scroll_down":
        await page.mouse.wheel(0, 600);
        break;
      case "scroll_up":
        await page.mouse.wheel(0, -600);
        break;
      case "back":
        await page.goBack({ waitUntil: "domcontentloaded" });
        break;
      case "forward":
        await page.goForward({ waitUntil: "domcontentloaded" });
        break;
      case "reload":
        await page.reload({ waitUntil: "domcontentloaded" });
        break;
      default:
        throw new Error(`unknown command ${command.type}`);
    }
  }

  return { snapshot, execute, close: () => browser.close() };
}
