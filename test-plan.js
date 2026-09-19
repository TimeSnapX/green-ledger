import {
  BEV_BANDS,
  BEV_RATE,
  WEEKLY_CORE,
  WEEKLY_CORE_AFTER_ANZ,
  WEEKLY_LIVING,
  WEEKLY_LENDERS,
  freezeStatus,
  weeklyEnvelope,
  billTone,
  remainingOneOffs,
  defaultPlan,
  totalDebt,
} from "./js/plan.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertClose(actual, expected, label, tolerance = 0.05) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

assert(BEV_RATE === 41.21, "Bevchain rate");
assertClose(WEEKLY_LIVING, 816.38, "living ops");
assertClose(WEEKLY_LENDERS, 134.6, "weekly lenders");
assertClose(WEEKLY_CORE, 950.98, "freeze envelope");
assertClose(WEEKLY_CORE_AFTER_ANZ, 1077.98, "envelope after ANZ");

const floor = BEV_BANDS[0];
assertClose(floor.gross, 1648.4, "floor gross");
assertClose(floor.net, 1302.4, "floor net");
assert(floor.kind === "floor", "floor kind");

const long5 = BEV_BANDS[1];
assertClose(long5.gross, 2266.55, "long 5-day gross");

const strong = BEV_BANDS[2];
assertClose(strong.gross, 3049.54, "strong week gross");

const freeze = freezeStatus(new Date(2026, 8, 19));
assert(freeze.active, "freeze still on 19 Sep 2026");
assert(freeze.daysLeft === 61, `days left was ${freeze.daysLeft}`);
assertClose(weeklyEnvelope(new Date(2026, 8, 19)), WEEKLY_CORE, "envelope during freeze");
assertClose(weeklyEnvelope(new Date(2026, 10, 20)), WEEKLY_CORE_AFTER_ANZ, "envelope after freeze");

const overdue = billTone({ iso: "2026-09-03", urgent: true }, false, new Date(2026, 8, 20));
assert(overdue === "overdue", `past due tone was ${overdue}`);
const upcoming = billTone({ iso: "2026-09-26", urgent: true }, false, new Date(2026, 8, 20));
assert(upcoming === "urgent", `Press Pay tone was ${upcoming}`);

const plan = defaultPlan();
assert(plan.debts.find((d) => d.id === "wagepay").balance === 0, "WagePay done");
assertClose(plan.debts.find((d) => d.id === "beforepay").balance, 212, "Beforepay 4 × $53");
assertClose(plan.debts.find((d) => d.id === "fundo").balance, 317, "Fundo remaining");
assertClose(plan.debts.find((d) => d.id === "wallet").balance, 266, "Wallet remaining");
assertClose(plan.debts.find((d) => d.id === "quickcash").balance, 580, "Quick Cash remaining");
assertClose(remainingOneOffs(plan.debts), 640, "Press Pay + friends one-offs");
assert(plan.band === "bev-min", "default planning band is the floor");
assertClose(totalDebt(plan.debts), 80 + 50 + 80 + 212 + 266 + 317 + 430 + 580 + 6000 + 6232, "open stack");

const floorFree = floor.net - WEEKLY_CORE;
assert(floorFree > 300, `floor should still clear the envelope, free was ${floorFree}`);

console.log("ok plan");
