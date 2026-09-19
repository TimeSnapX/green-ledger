import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join("C:\\Users\\kenny\\bitmail", "package.json"));
const { chromium } = require("playwright");

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, "test-results");
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];

async function shot(page, name) {
  await page.screenshot({ path: path.join(out, name + ".png"), fullPage: true });
}

function listen(page) {
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });
}

async function runDesktop() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    indexedDB.deleteDatabase("green-ledger");
    localStorage.clear();
  });
  const page = await context.newPage();
  listen(page);
  await page.goto("http://localhost:4175", { waitUntil: "networkidle" });
  await page.waitForSelector("h1");
  const title = await page.locator("h1").first().innerText();
  if (!/GreenLedger/i.test(title)) errors.push("title: " + title);
  await page.waitForSelector("#view-dashboard .stat-card");
  const dash = await page.locator("#view-dashboard").innerText();
  if (!/Bevchain/i.test(dash)) errors.push("dashboard missing Bevchain");
  if (!/\$1,302/.test(dash) && !/\$1302/.test(dash)) errors.push("dashboard missing floor net: " + dash.slice(0, 400));
  await shot(page, "01-dashboard");

  await page.click('[data-open="shift"]');
  await page.waitForSelector("#dlg-shift[open]");
  await page.fill("#shift-date", "2026-09-17");
  await page.click('[data-day-type="weekday"]');
  await page.fill("#shift-h", "8");
  await page.fill("#shift-m", "0");
  await page.fill("#shift-break", "0");
  await page.waitForFunction(() => document.querySelector("#shift-gross")?.textContent.includes("329.68"));
  const paid = await page.locator("#shift-paid").innerText();
  const gross = await page.locator("#shift-gross").innerText();
  if (paid !== "8h") errors.push("paid preview: " + paid);
  if (!gross.includes("329.68")) errors.push("gross preview: " + gross);
  await shot(page, "02-log-hours-dialog");
  await page.click('#shift-form button[type="submit"]');
  await page.waitForFunction(() => !document.querySelector("#dlg-shift")?.open);
  await page.waitForTimeout(400);
  const after = await page.locator("#view-dashboard").innerText();
  if (!/Thu 17 Sep 2026/.test(after) && !/17 Sep/.test(after)) errors.push("logged shift missing from dashboard");
  if (!/\$1,302/.test(after) && !/\$1302/.test(after)) errors.push("partial week should still live on the floor");
  await shot(page, "03-dashboard-after-shift");

  await page.click('[data-view="debts"]');
  await page.waitForSelector("#view-debts.active");
  const debts = await page.locator("#view-debts").innerText();
  if (!/WagePay/.test(debts) || !/Afterpay/.test(debts)) errors.push("debts missing lenders");
  if (!/overdue/i.test(debts)) errors.push("WagePay should show overdue on 19 Sep 2026");
  await shot(page, "04-debts");

  await page.click('[data-view="budget"]');
  await page.waitForSelector("#view-budget.active");
  const budget = await page.locator("#view-budget").innerText();
  if (!/\$41\.21/.test(budget)) errors.push("budget missing rate");
  if (!/First Express/.test(budget)) errors.push("budget missing old-role comparison");
  await page.click('[data-band="bev-strong"]');
  await page.waitForTimeout(200);
  await shot(page, "05-budget");

  await page.click('[data-view="hours"]');
  await page.waitForSelector("#view-hours.active");
  await shot(page, "06-hours");

  await page.click('[data-view="payslips"]');
  await page.waitForSelector("#view-payslips.active");
  await shot(page, "07-payslips");

  await page.click('[data-view="plan"]');
  await page.waitForSelector("#view-plan.active");
  const plan = await page.locator("#view-plan").innerText();
  if (!/snowball/i.test(plan) && !/Snowball/.test(plan)) errors.push("plan missing snowball");
  await shot(page, "08-plan");

  await page.click('[data-view="ritual"]');
  await page.waitForSelector("#view-ritual.active");
  await shot(page, "09-ritual");

  await page.click('[data-view="jobs"]');
  await page.waitForSelector("#view-jobs.active");
  const jobs = await page.locator("#view-jobs").innerText();
  if (!/Bevchain/.test(jobs)) errors.push("default job should be Bevchain");
  await shot(page, "10-jobs");

  await context.close();
}

async function runMobile() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(() => {
    indexedDB.deleteDatabase("green-ledger");
    localStorage.clear();
  });
  const page = await context.newPage();
  listen(page);
  await page.goto("http://localhost:4175", { waitUntil: "networkidle" });
  await page.waitForSelector("#view-dashboard .stat-card");
  await shot(page, "11-mobile-dashboard");
  await page.click('[data-view="budget"]');
  await page.waitForSelector("#view-budget.active");
  await shot(page, "12-mobile-budget");
  await page.click('[data-open="shift"]');
  await page.waitForSelector("#dlg-shift[open]");
  await shot(page, "13-mobile-log-dialog");
  await context.close();
}

try {
  await runDesktop();
  await runMobile();
} finally {
  await browser.close();
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("ok verify");
