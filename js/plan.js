import { parseISODate, roundCents, shiftPay, toISODate } from "./money.js";
import { paygWeekly, weeklyNetFromGross } from "./tax.js";

export const STORAGE_KEY = "green-ledger-plan-v1";
export const LEGACY_KEYS = ["debt-to-green-v3", "debt-to-green-v2", "debt-to-green-v1"];

export const BEV_RATE = 41.21;
export const BEV_JOB = "Bevchain · HR Multi-drop Delivery Driver";
export const FREEZE_START = "2026-08-20";
export const FREEZE_END = "2026-11-19";
export const ANZ_RESTART = "2026-11-19";
export const SMOKES_WEEK = ((12 + 13) / 2) * 7; // $87.50
export const ANZ_WEEKLY = 127; // $250 card + $300 loan = $550/mo

export const LIVING = {
  rent: 285,
  utilities: 40,
  comms: 51,
  food: 70,
  fuel: 100,
  smokes: SMOKES_WEEK,
  cash: 70,
  savings: 50,
  afterpay: 25,
  fundo: 20,
  wallet: 21.6,
  fines: 15,
};

export const WEEKLY_CORE = Object.values(LIVING).reduce((a, b) => a + b, 0);
export const WEEKLY_CORE_AFTER_ANZ = WEEKLY_CORE + ANZ_WEEKLY;

function weekdayGross(hours, days = 5) {
  return roundCents(days * shiftPay(hours, 0, BEV_RATE, "weekday").estGross);
}

function band(id, name, hours, gross, note, kind) {
  const tax = paygWeekly(gross);
  return {
    id,
    name,
    hours,
    gross,
    tax,
    net: weeklyNetFromGross(gross),
    note,
    kind,
  };
}

export const BEV_BANDS = [
  band(
    "bev-min",
    "Minimum floor",
    "8h × 5 days (40h ordinary)",
    weekdayGross(8, 5),
    "Casual ordinary only — live on this until four payslips prove more",
    "floor",
  ),
  band(
    "bev-long5",
    "Long 5-day",
    "10h × 5 weekdays (8 ordinary + 2 OT)",
    weekdayGross(10, 5),
    "Weekday 1.5× after 8h · still not weekend OT",
    "mid",
  ),
  band(
    "bev-strong",
    "Strong week",
    "10h × 5 weekdays + Saturday OT 10h",
    roundCents(weekdayGross(10, 5) + shiftPay(10, 0, BEV_RATE, "sat-ot").estGross),
    "Sat OT: first 2h at 1.5×, rest at 2× · extra is snowball, not lifestyle",
    "mid",
  ),
  band(
    "bev-peak",
    "Peak week",
    "11h × 5 weekdays + Sat OT 11h + Sunday 11h",
    roundCents(
      weekdayGross(11, 5) +
        shiftPay(11, 0, BEV_RATE, "sat-ot").estGross +
        shiftPay(11, 0, BEV_RATE, "sunday").estGross,
    ),
    "Burnout band — do not budget lifestyle or minimums to this",
    "peak",
  ),
];

export const FIRST_EXPRESS = {
  id: "first-express",
  label: "Old role · First Express",
  short: "First Express",
  weeklyNet: 1125,
  weeklyNetLow: 1100,
  weeklyNetHigh: 1150,
  rate: 27.63,
  hint: "Previous 5-day mid-point · kept as a comparison only",
};

export const PLANNING_BANDS = BEV_BANDS.map((b) => ({
  id: b.id,
  label:
    b.id === "bev-min"
      ? "Bevchain · 8h × 5 floor"
      : b.id === "bev-long5"
        ? "Bevchain · 10h × 5"
        : b.id === "bev-strong"
          ? "Bevchain · 10h × 6"
          : "Bevchain · peak 7-day",
  short: b.name,
  net: b.net,
  gross: b.gross,
  hint: b.hours,
  kind: b.kind,
}));

export function bandById(id) {
  return BEV_BANDS.find((b) => b.id === id) || BEV_BANDS[0];
}

export function freezeStatus(date = new Date()) {
  const now = date instanceof Date ? date : parseISODate(date);
  const start = parseISODate(FREEZE_START);
  const end = parseISODate(FREEZE_END);
  now.setHours(0, 0, 0, 0);
  const ms = end - now;
  const daysLeft = Math.max(0, Math.round(ms / 86400000));
  const weeksLeft = roundCents(daysLeft / 7);
  const active = now <= end;
  const started = now >= start;
  return {
    active,
    started,
    daysLeft,
    weeksLeft,
    endLabel: "19 Nov 2026",
    startLabel: "20 Aug 2026",
    anzBack: !active,
  };
}

export function weeklyEnvelope(date = new Date()) {
  return freezeStatus(date).active ? WEEKLY_CORE : WEEKLY_CORE_AFTER_ANZ;
}

export function money(n) {
  if (n == null || n === "") return "—";
  if (typeof n === "string") return n;
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-AU", {
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `($${s})` : `$${s}`;
}

export function roundMoney(n) {
  return Math.round(n);
}

export const DEFAULT_DEBTS = [
  {
    id: "fines",
    name: "Parking fines (×2)",
    balance: 690,
    original: 690,
    payment: "$60 × 2 early Sep, then $15/wk",
    role: "Payment plan — $60 per infringement due early September, then $15/week until $0",
    due: "2026-09-05",
    priority: 1,
    hot: true,
  },
  {
    id: "wagepay",
    name: "WagePay",
    balance: 138,
    original: 138,
    payment: "$138 final · 3 Sep 2026",
    role: "Due 3 Sep — if still open, kill this week then mark $0",
    due: "2026-09-03",
    priority: 2,
    hot: true,
  },
  {
    id: "beforepay",
    name: "Beforepay",
    balance: 53,
    original: 53,
    payment: "$53 final · ~27 Sep 2026",
    role: "Final around 27 Sep — then cleared. Do not roll it",
    due: "2026-09-27",
    priority: 3,
    hot: true,
  },
  {
    id: "fundo",
    name: "Fundo",
    balance: 583,
    original: 583,
    payment: "$20 / week until paid off",
    role: "~29 weeks at $20/wk if balance holds — extra cash shortens it",
    priority: 4,
  },
  {
    id: "wallet",
    name: "WalletWizard",
    balance: 432,
    original: 432,
    payment: "$21.60 / week",
    role: "Keep weekly until $0 — then redirect",
    priority: 5,
  },
  {
    id: "afterpay",
    name: "Afterpay",
    balance: 1514,
    original: 1514,
    payment: "$25 / week from 28 Aug",
    role: "No new purchases; $25/wk until paid off",
    priority: 6,
  },
  {
    id: "card",
    name: "ANZ Credit Card (maxed)",
    balance: 6000,
    original: 6000,
    payment: "$0 until 19 Nov, then $250/mo",
    role: "Frozen — no new spend. Minimum restarts 19 Nov 2026",
    due: ANZ_RESTART,
    priority: 7,
  },
  {
    id: "loan",
    name: "ANZ Personal Loan",
    balance: 6232,
    original: 6232,
    payment: "$0 until 19 Nov, then $300/mo",
    role: "Paused under hardship. Minimum restarts 19 Nov 2026 — finish last",
    due: ANZ_RESTART,
    priority: 8,
  },
];

export const BILLS = [
  { id: "wagepay", name: "WagePay final", amount: 138, when: "3 Sep 2026", iso: "2026-09-03", note: "Then cleared", urgent: true },
  { id: "fine-deposit", name: "Parking fines first instalment", amount: 120, when: "Early Sep 2026", iso: "2026-09-05", note: "$60 per infringement (×2)", urgent: true },
  { id: "beforepay", name: "Beforepay final", amount: 53, when: "~27 Sep 2026", iso: "2026-09-27", note: "Due this month — then cleared", urgent: true },
  { id: "afterpay-start", name: "Afterpay $25/wk", amount: 25, when: "Weekly from 28 Aug", iso: "2026-08-28", note: "Until paid off — no new buys", urgent: false },
  { id: "fines-weekly", name: "Parking fines plan", amount: 15, when: "Weekly after first $60s", note: "$15/wk until both infringements are $0", urgent: false },
  { id: "rent", name: "Rent", amount: 285, when: "Thursdays (weekly)", note: "Always first · operating pocket", urgent: false },
  { id: "fundo-pay", name: "Fundo", amount: 20, when: "Weekly", note: "Until paid off", urgent: false },
  { id: "wallet-pay", name: "WalletWizard", amount: 21.6, when: "Weekly", note: "Until paid off", urgent: false },
  { id: "anz-restart", name: "ANZ card + loan restart", amount: 550, when: "19 Nov 2026", iso: ANZ_RESTART, note: "Card $250 + loan $300 resume this day", urgent: true },
  { id: "card-min", name: "ANZ credit card minimum", amount: 250, when: "From 19 Nov (monthly)", note: "$0 until restart date", urgent: false },
  { id: "loan-min", name: "ANZ personal loan", amount: 300, when: "From 19 Nov (monthly)", note: "$0 until restart date", urgent: false },
  { id: "utilities", name: "Water + electricity", amount: 40, when: "Weekly share", note: "Hold", urgent: false },
  { id: "comms", name: "Phone + internet", amount: 51, when: "Weekly share", note: "$219/mo ÷ 4.33", urgent: false },
];

export const BUDGET_ROWS = [
  { cat: "Net take-home (Bevchain)", old: 1125, notes: "Floor until logged hours / payslips prove more", income: true },
  { cat: "Rent", old: 285, neu: 285, notes: "Thursday — always first" },
  { cat: "Water + electricity", old: 40, neu: 40, notes: "Hold" },
  { cat: "Phone + internet", old: 51, neu: 51, notes: "$219/mo ÷ 4.33" },
  { cat: "Food / groceries", old: 70, neu: 70, notes: "Already tight — don’t slash" },
  { cat: "Fuel", old: 100, neu: 100, notes: "Work / personal — track receipts" },
  { cat: "Smokes", old: 100, neu: SMOKES_WEEK, notes: "$12–$13/day actual (~$84–$91/wk)", cut: true },
  { cat: "Daily allowance", old: 105, neu: 70, notes: "$10/day envelope", cut: true },
  { cat: "Emergency savings", old: 100, neu: 50, notes: "Still pay yourself — smaller", cut: true },
  { cat: "ANZ loan + card", old: 127, neu: 0, notes: "$0 until 19 Nov · then $250 + $300/mo back", cut: true },
  { cat: "Afterpay", old: 50, neu: 25, notes: "$25/wk until paid off", cut: true },
  { cat: "Fundo", old: 48.57, neu: 20, notes: "$20/wk until paid off", cut: true },
  { cat: "WalletWizard", old: 21.6, neu: 21.6, notes: "Unchanged weekly" },
  { cat: "Parking fines plan", old: 0, neu: 15, notes: "After $60 × 2 early Sep", cut: true },
  { cat: "Debt attack / buffer", old: 0, neu: 60, notes: "Extra to snowball — grows with overtime", cut: true },
];

export const LEVERS = [
  { item: "Smokes (actual)", now: SMOKES_WEEK, rec: SMOKES_WEEK, saved: 0, how: "$12–$13/day is the live number. $50/wk cap would free ~$37.50" },
  { item: "Daily allowance", now: 105, rec: 70, saved: 35, how: "$10/day cash only — no top-ups" },
  { item: "Savings (temp.)", now: 100, rec: 50, saved: 50, how: "Still save; rest → debt" },
  { item: "ANZ pause (to 19 Nov)", now: 127, rec: 0, saved: 127, how: "Holiday only — restarts $550/mo on 19 Nov" },
  { item: "Food / fuel / rent", now: "As now", rec: "Hold", saved: 0, how: "Protect work and health" },
];

export const STAGES = [
  { name: "Stable", def: "Hardship freeze held · Bevchain floor covers the envelope · fines paid · no new BNPL · no payday renewals" },
  { name: "Breathing room", def: "Cashflow positive on 8h × 5 · small loans gone · Afterpay closed" },
  { name: "In the green", def: "Card falling monthly · $1,000+ emergency cash · surplus ≥ $100/wk avg · no BNPL" },
  { name: "Strong", def: "Card under ~$2,000 or closed · 1 month expenses saved · habits stick after freeze lifts" },
];

export const PHASES = [
  {
    title: "Phase 0 — Hardship freeze on Bevchain pay",
    when: "20 Aug → 19 Nov 2026",
    goal: "Accounts frozen; ANZ $0; live on the 8h × 5 floor",
    items: [
      "Bevchain is the income: $41.21/hr casual. Budget to 8 hours × 5 days until four payslips prove a higher band.",
      "ANZ card + loan stay paused until 19 Nov — do not spend the $127/wk holiday.",
      "WagePay $138 was due 3 Sep. If the balance is still open, pay it this week and mark $0.",
      "Parking fines: $60 × 2 early September, then $15/week until paid off.",
      "Beforepay $53 around 27 Sep — then cleared. Afterpay $25/week; Fundo $20/week; WalletWizard $21.60/week.",
      "Log every shift the day you finish. Overtime is snowball, not a new lifestyle.",
    ],
    status: "active",
  },
  {
    title: "Phase 1 — Stabilise inside the freeze",
    when: "Now → 19 Nov 2026",
    goal: "Hold live minimums; snowball leftovers into fines then Fundo",
    items: [
      "Live weekly: rent, Fundo $20, Afterpay $25, WW $21.60, fines $15 after the deposits.",
      "Floor take-home is ~$1,302/wk (PAYG estimate). After the ~$835 freeze envelope that leaves ~$467/wk to attack debt.",
      "Extra days (Sat OT / Sunday) go to the current snowball target only.",
      "Success: freeze held, WagePay + Beforepay gone, fine deposits paid, no new debt, first payslips on file.",
    ],
    status: "upcoming",
  },
  {
    title: "Phase 2 — ANZ restarts 19 Nov",
    when: "19 Nov 2026 → ~early 2027",
    goal: "Card $250 + loan $300 come back; do not reopen spend",
    items: [
      "From 19 Nov the envelope needs ~$127/wk more — that is why the freeze lifestyle has to stick.",
      "WalletWizard still weekly until $0, then redirect ~$22/wk to Afterpay.",
      "Afterpay at $25/wk is slow on the current balance — extra days finish it years earlier.",
      "Stay casual-safe: live on 8h × 5 until conversion or a full month of matching payslips.",
      "Close/freeze Afterpay habit — do not reopen the loop.",
    ],
    status: "upcoming",
  },
  {
    title: "Phase 3 — Attack the credit card",
    when: "When Afterpay is clear",
    goal: "Main wealth-destroyer becomes the focus",
    items: [
      "Keep personal loan $300/mo from the 19 Nov restart.",
      "Card min $250 PLUS every freed dollar + extra days.",
      "On the Bevchain floor the $6k card can still move. Overtime is acceleration, not a lifestyle upgrade.",
    ],
    status: "upcoming",
  },
  {
    title: "Phase 4 — Green & guardrails",
    when: "Ongoing",
    goal: "Buffer + habits so it doesn’t bounce back after the freeze",
    items: [
      "Build emergency cash to $1,000, then ~1 month core bills.",
      "Restore savings to $100/wk once the card is clearly falling.",
      "Smokes: hold $12–$13/day or cut toward $50/wk (~$37.50 freed).",
      "Personal loan on autopay until $0 — don’t refinance worse.",
    ],
    status: "upcoming",
  },
];

export const SNOWBALL = [
  { n: 1, target: "WagePay + Beforepay + fine deposits", why: "Due-dates and legal risk", when: "3 Sep · early Sep · ~27 Sep" },
  { n: 2, target: "Parking fines remainder + Fundo", why: "Weekly plans that free cash when they die", when: "After the three micro-finals" },
  { n: 3, target: "Afterpay", why: "Stops the BNPL trap — $25/wk is the floor not the finish", when: "When small lenders are moving" },
  { n: 4, target: "ANZ credit card", why: "Highest ongoing interest drag", when: "Mins restart 19 Nov; extra after Afterpay $0" },
  { n: 5, target: "ANZ personal loan", why: "Keep mins from 19 Nov; finish last", when: "After card under control" },
];

export const PATH = [
  { period: "Now → 19 Nov", focus: "Bevchain floor · hardship freeze · kill micro-finals", pos: "Live on 8h × 5 · extra days to snowball" },
  { period: "~27 Sep 2026", focus: "Beforepay $53 final", pos: "Then cleared — do not roll it" },
  { period: "19 Nov 2026", focus: "ANZ card $250 + loan $300 restart", pos: "Envelope must already be a habit" },
  { period: "2027", focus: "Afterpay → $0; card attack", pos: "Breathing-room stage — faster if extra days stick" },
  { period: "2027–28", focus: "Heavy card paydown + buffer", pos: "“In the green” is realistic on the floor plus overtime" },
];

export const CHECKLIST = [
  "Calendar 19 Nov 2026 in red: ANZ card $250 and personal loan $300 both restart that day.",
  "Set the freeze operating pocket: rent, food, fuel, smokes at $12–$13/day, $70 cash, $50 savings, Fundo $20, Afterpay $25, WW $21.60.",
  "Log every Bevchain shift in Hours the day you finish. Budget to 8h × 5 until four payslips prove a higher band.",
  "Drop each payslip when it lands. Actual net is the source of truth — hours are an estimate.",
  "WagePay $138 was due 3 Sep. If still open, pay it this week and mark $0.",
  "Parking fines: $60 per infringement early September, then $15/week until paid off.",
  "Beforepay $53 due around 27 Sep — then cleared. Do not roll it.",
  "Afterpay $25/week until $0. Freeze new purchases; remove saved cards from shopping apps.",
  "Treat Saturday OT and Sunday as debt-attack days, not smoke or spend days.",
  "Tell one trusted person the freeze + “no new debt” rule. Update balances here after each payment.",
];

export const RITUAL_STEPS = [
  "Check Bevchain net pay deposited. During the freeze, only the operating pocket should move — do not unfreeze accounts for extras.",
  "Pay rent (if due) and live debts this week: Fundo $20, Afterpay $25, fines $15 after the early-Sep deposits, WalletWizard $21.60. ANZ stays $0 until 19 Nov.",
  "Move $50 to savings (separate / locked if possible — harder to touch).",
  "Cash out $70 for the week’s daily allowance only — when it’s gone, it’s gone.",
  "Smokes are $12–$13/day (~$84–$91/wk). Pay that from the envelope. Any day under $12 is extra snowball — do not float to $15.",
  "Any leftover after food/fuel → current snowball target. Overtime leftover grows — still one target only.",
  "Log this week’s shifts if you haven’t. Tick the week: On plan / Off plan + one sentence why. Budget to the 5-day floor until four payslips prove a higher band.",
];

export function mergeDebts(saved) {
  const byId = new Map((saved || []).map((d) => [d.id, d]));
  return DEFAULT_DEBTS.map((d) => {
    const prev = byId.get(d.id);
    if (!prev) return { ...d };
    return { ...d, balance: typeof prev.balance === "number" ? prev.balance : d.balance };
  });
}

export function defaultPlan() {
  return {
    debts: DEFAULT_DEBTS.map((d) => ({ ...d })),
    checks: CHECKLIST.map(() => false),
    weekLogs: [],
    paidBills: {},
    band: "bev-min",
  };
}

export function loadPlan() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const key of LEGACY_KEYS) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }
    }
    if (!raw) return defaultPlan();
    const parsed = JSON.parse(raw);
    const base = defaultPlan();
    const band = BEV_BANDS.some((b) => b.id === parsed.band)
      ? parsed.band
      : parsed.scenario && String(parsed.scenario).startsWith("bev")
        ? parsed.scenario
        : "bev-min";
    return {
      ...base,
      ...parsed,
      debts: mergeDebts(parsed.debts),
      checks: Array.isArray(parsed.checks) && parsed.checks.length === CHECKLIST.length ? parsed.checks : base.checks,
      band: BEV_BANDS.some((b) => b.id === band) ? band : "bev-min",
    };
  } catch {
    return defaultPlan();
  }
}

export function savePlan(plan) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
}

export function totalDebt(debts) {
  return debts.reduce((s, d) => s + (d.balance > 0 ? d.balance : 0), 0);
}

export function activeSnowball(debts) {
  const ordered = [...debts].sort((a, b) => a.priority - b.priority);
  return ordered.find((d) => d.balance > 0) || ordered[ordered.length - 1];
}

export function snowballStep(target) {
  const t = target?.id;
  if (t === "fines" || t === "wagepay" || t === "beforepay") return 1;
  if (t === "fundo" || t === "wallet") return 2;
  if (t === "afterpay") return 3;
  if (t === "card") return 4;
  return 5;
}

export function remainingOneOffs(debts) {
  const ids = ["wagepay", "beforepay"];
  return roundCents(ids.reduce((s, id) => s + Math.max(0, debts.find((d) => d.id === id)?.balance || 0), 0));
}

export function billTone(bill, paid, date = new Date()) {
  if (paid) return "paid";
  if (!bill.iso) return bill.urgent ? "urgent" : "normal";
  const due = parseISODate(bill.iso);
  const now = date instanceof Date ? date : parseISODate(date);
  now.setHours(0, 0, 0, 0);
  if (due < now && bill.urgent) return "overdue";
  if (bill.urgent) return "urgent";
  return "normal";
}

export function shortWhen(w) {
  if (w.includes("Early Sep")) return "Early Sep";
  if (w.includes("Sep")) return w.replace("2026", "").replace("~", "").trim().slice(0, 10);
  if (w.includes("Nov")) return w.replace("2026", "").trim().slice(0, 10);
  if (w.includes("Aug")) return w.replace("2026", "").trim().slice(0, 10);
  if (w.includes("Thursday")) return "Thu";
  if (w.includes("Weekly")) return "Wk";
  return w.slice(0, 10);
}

export function stageIndex(debts) {
  const open = (id) => (debts.find((d) => d.id === id)?.balance || 0) > 0;
  if (open("wagepay") || open("beforepay") || open("fines")) return 0;
  if (open("fundo") || open("wallet") || open("afterpay")) return 1;
  if (open("card") && (debts.find((d) => d.id === "card")?.balance || 0) > 2000) return 2;
  return 3;
}

export { toISODate, weeklyNetFromGross, paygWeekly };
