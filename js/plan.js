import { parseISODate, roundCents, shiftPay, toISODate } from "./money.js";
import { paygWeekly, weeklyNetFromGross } from "./tax.js";

export const STORAGE_KEY = "green-ledger-plan-v2";
export const LEGACY_KEYS = ["green-ledger-plan-v1", "debt-to-green-v3", "debt-to-green-v2", "debt-to-green-v1"];

export const BEV_RATE = 41.21;
export const BEV_JOB = "Bevchain · HR Multi-drop Delivery Driver";
export const FREEZE_START = "2026-08-20";
export const FREEZE_END = "2026-11-19";
export const ANZ_RESTART = "2026-11-19";
export const ANZ_WEEKLY = 127; // $250 card + $300 loan = $550/mo

export function monthlyToWeekly(amount) {
  return roundCents((Number(amount) * 12) / 52);
}

export const SMOKES_WEEK = 120; // cap
export const FUEL_WEEK = 120; // minimum at current prices
export const RENT_NOW = 285;
export const RENT_AHEAD = 270; // when 2 weeks in front — standing uncertain
export const PHONE_MONTH = 120; // due 13th
export const INTERNET_MONTH = 105; // due 25th
export const INSURANCE_MONTH = 41; // car, due 18th

export const LIVING = {
  rent: RENT_NOW,
  utilities: 40,
  phone: monthlyToWeekly(PHONE_MONTH),
  internet: monthlyToWeekly(INTERNET_MONTH),
  insurance: monthlyToWeekly(INSURANCE_MONTH),
  food: 70,
  fuel: FUEL_WEEK,
  smokes: SMOKES_WEEK,
  cash: 70,
  savings: 50,
};

export const LENDER_WEEK = {
  beforepay: 53,
  quickcash: 40,
  fundo: 20,
  wallet: 21.6,
};

export const WEEKLY_LIVING = Object.values(LIVING).reduce((a, b) => a + b, 0);
export const WEEKLY_LENDERS = Object.values(LENDER_WEEK).reduce((a, b) => a + b, 0);
export const WEEKLY_CORE = roundCents(WEEKLY_LIVING + WEEKLY_LENDERS);
export const WEEKLY_CORE_AFTER_ANZ = roundCents(WEEKLY_CORE + ANZ_WEEKLY);

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
    id: "wagepay",
    name: "WagePay",
    balance: 0,
    original: 138,
    payment: "Cleared",
    role: "Done",
    due: "2026-09-03",
    priority: 0,
    hot: false,
  },
  {
    id: "presspay",
    name: "Press Pay",
    balance: 80,
    original: 80,
    payment: "$80 next week · then done",
    role: "One payment then cleared",
    due: "2026-09-26",
    priority: 1,
    hot: true,
  },
  {
    id: "timbo",
    name: "Timbo (friend)",
    balance: 50,
    original: 50,
    payment: "$50 next week",
    role: "Personal loan — pay next week then clear",
    due: "2026-09-26",
    priority: 2,
    hot: true,
  },
  {
    id: "josh",
    name: "Josh (friend)",
    balance: 80,
    original: 80,
    payment: "$80 next week",
    role: "Personal loan — pay next week then clear",
    due: "2026-09-26",
    priority: 3,
    hot: true,
  },
  {
    id: "beforepay",
    name: "Beforepay",
    balance: 212,
    original: 212,
    payment: "$53 / week for next 4 weeks",
    role: "Four weekly hits then cleared — do not roll it",
    due: "2026-10-18",
    priority: 4,
    hot: true,
  },
  {
    id: "wallet",
    name: "WalletWizard",
    balance: 266,
    original: 266,
    payment: "$21.60 / week until paid off",
    role: "~12 weeks at $21.60/wk if balance holds — then redirect",
    priority: 5,
  },
  {
    id: "fundo",
    name: "Fundo",
    balance: 317,
    original: 317,
    payment: "$20 / week until paid off",
    role: "~16 weeks at $20/wk if balance holds — then redirect",
    priority: 6,
  },
  {
    id: "mike",
    name: "Mike (friend)",
    balance: 430,
    original: 430,
    payment: "$430 over 2 payments, then clear",
    role: "Personal loan — two payments then done",
    priority: 7,
  },
  {
    id: "quickcash",
    name: "Quick Cash",
    balance: 580,
    original: 580,
    payment: "$40 / week until paid off",
    role: "~14.5 weeks at $40/wk if balance holds — then redirect",
    priority: 8,
  },
  {
    id: "card",
    name: "ANZ Credit Card (maxed)",
    balance: 6000,
    original: 6000,
    payment: "$0 until 19 Nov, then $250/mo",
    role: "Unchanged since freeze — no new spend. Minimum restarts 19 Nov 2026",
    due: ANZ_RESTART,
    priority: 9,
  },
  {
    id: "loan",
    name: "ANZ Personal Loan",
    balance: 6232,
    original: 6232,
    payment: "$0 until 19 Nov, then $300/mo",
    role: "Unchanged since freeze. Minimum restarts 19 Nov 2026 — finish last",
    due: ANZ_RESTART,
    priority: 10,
  },
];

export const BILLS = [
  { id: "internet-sep", name: "Internet", amount: INTERNET_MONTH, when: "25 Sep 2026", iso: "2026-09-25", note: "$105 due the 25th every month", urgent: true },
  { id: "presspay", name: "Press Pay", amount: 80, when: "Next week", iso: "2026-09-26", note: "One $80 hit then done", urgent: true },
  { id: "timbo", name: "Timbo (friend)", amount: 50, when: "Next week", iso: "2026-09-26", note: "Personal loan — then clear", urgent: true },
  { id: "josh", name: "Josh (friend)", amount: 80, when: "Next week", iso: "2026-09-26", note: "Personal loan — then clear", urgent: true },
  { id: "beforepay", name: "Beforepay", amount: 53, when: "Weekly · 4 weeks", iso: "2026-10-18", note: "$53/wk until four payments are done", urgent: true },
  { id: "phone", name: "Phone", amount: PHONE_MONTH, when: "13th monthly", iso: "2026-10-13", note: "$120 due the 13th every month", urgent: false },
  { id: "insurance", name: "Car insurance", amount: INSURANCE_MONTH, when: "18th monthly", iso: "2026-10-18", note: "$41 due the 18th every month", urgent: false },
  { id: "internet", name: "Internet", amount: INTERNET_MONTH, when: "25th monthly", note: "$105 due the 25th every month", urgent: false },
  { id: "rent", name: "Rent", amount: RENT_NOW, when: "Thursdays (weekly)", note: "$285 until 2 weeks in front (uncertain) · then $270", urgent: false },
  { id: "fundo-pay", name: "Fundo", amount: 20, when: "Weekly", note: "Until $317 is $0", urgent: false },
  { id: "wallet-pay", name: "WalletWizard", amount: 21.6, when: "Weekly", note: "Until $266 is $0", urgent: false },
  { id: "quickcash-pay", name: "Quick Cash", amount: 40, when: "Weekly", note: "Until $580 is $0", urgent: false },
  { id: "mike", name: "Mike (friend)", amount: 430, when: "2 payments", note: "$430 split over two payments then clear", urgent: false },
  { id: "anz-restart", name: "ANZ card + loan restart", amount: 550, when: "19 Nov 2026", iso: ANZ_RESTART, note: "Card $250 + loan $300 resume this day", urgent: true },
  { id: "card-min", name: "ANZ credit card minimum", amount: 250, when: "From 19 Nov (monthly)", note: "$0 until restart date", urgent: false },
  { id: "loan-min", name: "ANZ personal loan", amount: 300, when: "From 19 Nov (monthly)", note: "$0 until restart date", urgent: false },
  { id: "utilities", name: "Water + electricity", amount: 40, when: "Weekly share", note: "Hold", urgent: false },
];

export const BUDGET_ROWS = [
  { cat: "Net take-home (Bevchain)", old: 1125, notes: "Floor until logged hours / payslips prove more", income: true },
  { cat: "Rent", old: 285, neu: RENT_NOW, notes: "$285 until 2 weeks in front (uncertain) · then $270" },
  { cat: "Water + electricity", old: 40, neu: 40, notes: "Hold" },
  { cat: "Phone", old: 28, neu: LIVING.phone, notes: "$120/mo due the 13th" },
  { cat: "Internet", old: 24, neu: LIVING.internet, notes: "$105/mo due the 25th" },
  { cat: "Car insurance", old: 0, neu: LIVING.insurance, notes: "$41/mo due the 18th", cut: true },
  { cat: "Food / groceries", old: 70, neu: 70, notes: "Already tight — don’t slash" },
  { cat: "Fuel", old: 100, neu: FUEL_WEEK, notes: "Minimum at current prices", cut: true },
  { cat: "Smokes", old: 87.5, neu: SMOKES_WEEK, notes: "Cap — do not float above $120/wk", cut: true },
  { cat: "Daily allowance", old: 105, neu: 70, notes: "$10/day envelope", cut: true },
  { cat: "Emergency savings", old: 100, neu: 50, notes: "Still pay yourself — smaller", cut: true },
  { cat: "ANZ loan + card", old: 127, neu: 0, notes: "$0 until 19 Nov · then $250 + $300/mo back", cut: true },
  { cat: "Beforepay", old: 0, neu: 53, notes: "$53/wk for 4 weeks then $0", cut: true },
  { cat: "Quick Cash", old: 0, neu: 40, notes: "$40/wk until $580 is $0", cut: true },
  { cat: "Fundo", old: 20, neu: 20, notes: "$20/wk until $317 is $0" },
  { cat: "WalletWizard", old: 21.6, neu: 21.6, notes: "$21.60/wk until $266 is $0" },
  { cat: "Debt attack / buffer", old: 0, neu: 60, notes: "Extra to snowball — Press Pay / friends are one-offs on top", cut: true },
];

export const LEVERS = [
  { item: "Smokes (cap)", now: SMOKES_WEEK, rec: SMOKES_WEEK, saved: 0, how: "$120/wk is the maximum. Every dollar under that is snowball" },
  { item: "Fuel (floor)", now: FUEL_WEEK, rec: FUEL_WEEK, saved: 0, how: "$120/wk minimum at current prices — protect the work car" },
  { item: "Daily allowance", now: 105, rec: 70, saved: 35, how: "$10/day cash only — no top-ups" },
  { item: "Savings (temp.)", now: 100, rec: 50, saved: 50, how: "Still save; rest → debt" },
  { item: "ANZ pause (to 19 Nov)", now: 127, rec: 0, saved: 127, how: "Holiday only — restarts $550/mo on 19 Nov" },
  { item: "Rent when 2 weeks ahead", now: RENT_NOW, rec: RENT_AHEAD, saved: 15, how: "Standing uncertain — keep $285 until you are actually two weeks in front" },
];

export const STAGES = [
  { name: "Stable", def: "Hardship freeze held · Bevchain floor covers the new envelope · WagePay done · no new credit" },
  { name: "Breathing room", def: "Press Pay, Beforepay, friends, Wallet, Fundo and Quick Cash all $0 · only ANZ left" },
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
      "ANZ card + loan are unchanged since the freeze and stay paused until 19 Nov — do not spend the $127/wk holiday.",
      "WagePay is done. Next week is heavy: Press Pay $80, Timbo $50, Josh $80, plus internet $105 on the 25th.",
      "Beforepay is $53/week for four weeks then gone. Quick Cash $40, Fundo $20, WalletWizard $21.60 until those balances die.",
      "Fuel $120/wk minimum. Smokes $120/wk maximum. Rent $285 until you are actually two weeks in front, then $270.",
      "Log every shift the day you finish. Overtime is snowball, not a new lifestyle.",
    ],
    status: "active",
  },
  {
    title: "Phase 1 — Kill the small stack",
    when: "Now → before 19 Nov 2026",
    goal: "Clear Press Pay, friends, Beforepay, Wallet, Fundo, Quick Cash",
    items: [
      "Live weekly after next week’s one-offs: rent, Beforepay $53 (4 weeks), Quick Cash $40, Fundo $20, WW $21.60.",
      "Phone $120 on the 13th, car insurance $41 on the 18th, internet $105 on the 25th — calendar those, don’t let them surprise the week.",
      "Mike $430 over two payments once the next-week hits are done.",
      "Success: every non-ANZ balance is $0, freeze still held, no new credit.",
    ],
    status: "upcoming",
  },
  {
    title: "Phase 2 — ANZ restarts 19 Nov",
    when: "19 Nov 2026 → ~early 2027",
    goal: "Card $250 + loan $300 come back; only ANZ left to tackle",
    items: [
      "From 19 Nov the envelope needs ~$127/wk more — that is why fuel/smokes/rent have to already stick.",
      "If small lenders are gone, every freed dollar plus extra days hits the credit card on top of the $250 minimum.",
      "Stay casual-safe: live on 8h × 5 until conversion or a full month of matching payslips.",
      "Do not reopen BNPL or payday products once this stack is dead.",
    ],
    status: "upcoming",
  },
  {
    title: "Phase 3 — Attack the credit card",
    when: "When small loans and friends are clear",
    goal: "Main wealth-destroyer becomes the only target",
    items: [
      "Keep personal loan $300/mo from the 19 Nov restart.",
      "Card min $250 PLUS every freed weekly (Quick Cash $40, Fundo $20, WW $21.60, Beforepay $53, friend payments).",
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
      "Smokes: hold the $120 cap or cut it — every dollar under is snowball.",
      "Personal loan on autopay until $0 — don’t refinance worse.",
    ],
    status: "upcoming",
  },
];

export const SNOWBALL = [
  { n: 1, target: "Press Pay + Timbo + Josh", why: "Due next week — one-hit clears", when: "Week of 21 Sep" },
  { n: 2, target: "Beforepay", why: "$53/wk for 4 weeks then gone", when: "Keep weekly · extra shortens it" },
  { n: 3, target: "WalletWizard → Fundo → Quick Cash + Mike", why: "Last small lenders and the remaining friend loan", when: "After the 4 Beforepay weeks / two Mike payments" },
  { n: 4, target: "ANZ credit card", why: "Highest ongoing interest drag — only ANZ left after that", when: "Mins restart 19 Nov; extra after small stack $0" },
  { n: 5, target: "ANZ personal loan", why: "Keep mins from 19 Nov; finish last", when: "After card under control" },
];

export const HEAVY_WEEK = {
  when: "Week of 21 Sep 2026",
  isoEnd: "2026-09-27",
  items: [
    { name: "Press Pay", amount: 80 },
    { name: "Timbo", amount: 50 },
    { name: "Josh", amount: 80 },
    { name: "Internet (25th)", amount: 105 },
  ],
};

export const PATH = [
  { period: "Week of 21 Sep", focus: "Press Pay $80 · Timbo $50 · Josh $80 · internet $105 on the 25th", pos: "Heavy week — still doable on the floor" },
  { period: "Next 4 weeks", focus: "Beforepay $53/wk until $0", pos: "Then that $53/wk redirects to the next small target" },
  { period: "Through Oct", focus: "Wallet $266 · Fundo $317 · Quick Cash $580 · Mike $430", pos: "All small loans then gone — only ANZ left" },
  { period: "19 Nov 2026", focus: "ANZ card $250 + loan $300 restart", pos: "Envelope must already be a habit" },
  { period: "2027", focus: "Card attack on the Bevchain floor", pos: "Realistic once the small stack is dead" },
];

export const CHECKLIST = [
  "Calendar 19 Nov 2026 in red: ANZ card $250 and personal loan $300 both restart that day.",
  "Calendar next week: Press Pay $80, Timbo $50, Josh $80, internet $105 on 25 Sep.",
  "Set the operating pocket: rent $285, fuel $120 min, smokes $120 max, food, $70 cash, $50 savings.",
  "Phone $120 on the 13th, car insurance $41 on the 18th, internet $105 on the 25th — every month.",
  "Log every Bevchain shift in Hours the day you finish. Budget to 8h × 5 until four payslips prove a higher band.",
  "Drop each payslip when it lands. Actual net is the source of truth — hours are an estimate.",
  "Beforepay $53/week for four weeks — then mark $0. Do not roll it.",
  "Keep Fundo $20, WalletWizard $21.60, Quick Cash $40 automatic until those balances die.",
  "Mike $430 over two payments after the next-week friend hits. Then only ANZ is left.",
  "Tell one trusted person the freeze + “no new debt” rule. Update balances here after each payment.",
];

export const RITUAL_STEPS = [
  "Check Bevchain net pay deposited. During the freeze, only the operating pocket should move — do not unfreeze accounts for extras.",
  "Pay rent ($285, or $270 only if you are actually two weeks in front). Live weekly debts: Beforepay $53 (while the 4 weeks run), Quick Cash $40, Fundo $20, WalletWizard $21.60. ANZ stays $0 until 19 Nov.",
  "If this is the heavy week: Press Pay $80, Timbo $50, Josh $80, and internet $105 if the 25th falls here.",
  "Monthlies on their day: phone $120 on the 13th, car insurance $41 on the 18th, internet $105 on the 25th.",
  "Move $50 to savings (separate / locked if possible — harder to touch).",
  "Cash out $70 for the week’s daily allowance only — when it’s gone, it’s gone.",
  "Smokes cap is $120/wk. Fuel is $120/wk minimum. Any smoke day under the cap is extra snowball — do not float above $120.",
  "Any leftover after food/fuel → current snowball target (Press Pay / friends first, then Beforepay). Overtime leftover grows — still one extra target only.",
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
    paidBills: { wagepay: true },
    band: "bev-min",
  };
}

export function loadPlan() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    let raw = current;
    let legacy = false;
    if (!raw) {
      for (const key of LEGACY_KEYS) {
        raw = localStorage.getItem(key);
        if (raw) {
          legacy = true;
          break;
        }
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
    if (legacy) {
      return {
        ...base,
        weekLogs: Array.isArray(parsed.weekLogs) ? parsed.weekLogs : [],
        band: BEV_BANDS.some((b) => b.id === band) ? band : "bev-min",
      };
    }
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
  if (t === "presspay" || t === "timbo" || t === "josh") return 1;
  if (t === "beforepay") return 2;
  if (t === "wallet" || t === "fundo" || t === "quickcash" || t === "mike") return 3;
  if (t === "card") return 4;
  return 5;
}

export function remainingOneOffs(debts) {
  const ids = ["presspay", "timbo", "josh", "mike"];
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
  if (w.includes("Next week")) return "Next wk";
  if (w.includes("13th")) return "13th";
  if (w.includes("18th")) return "18th";
  if (w.includes("25th")) return "25th";
  if (w.includes("Early Sep")) return "Early Sep";
  if (w.includes("Sep")) return w.replace("2026", "").replace("~", "").trim().slice(0, 10);
  if (w.includes("Nov")) return w.replace("2026", "").trim().slice(0, 10);
  if (w.includes("Oct")) return w.replace("2026", "").trim().slice(0, 10);
  if (w.includes("Aug")) return w.replace("2026", "").trim().slice(0, 10);
  if (w.includes("Thursday")) return "Thu";
  if (w.includes("Weekly")) return "Wk";
  if (w.includes("2 payments")) return "2 pays";
  return w.slice(0, 10);
}

export function stageIndex(debts) {
  const open = (id) => (debts.find((d) => d.id === id)?.balance || 0) > 0;
  const small =
    open("presspay") ||
    open("beforepay") ||
    open("wallet") ||
    open("fundo") ||
    open("quickcash") ||
    open("timbo") ||
    open("josh") ||
    open("mike");
  if (small) return 0;
  if (open("card") && (debts.find((d) => d.id === "card")?.balance || 0) > 2000) return 1;
  if (open("card") || open("loan")) return 2;
  return 3;
}

export { toISODate, weeklyNetFromGross, paygWeekly };
