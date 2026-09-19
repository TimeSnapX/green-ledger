import {
  BEV_BANDS,
  BEV_RATE,
  WEEKLY_CORE,
  WEEKLY_CORE_AFTER_ANZ,
  freezeStatus,
  weeklyEnvelope,
  billTone,
  remainingOneOffs,
  defaultPlan,
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
assertClose(WEEKLY_CORE, 835.1, "freeze envelope");
assertClose(WEEKLY_CORE_AFTER_ANZ, 962.1, "envelope after ANZ");

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

const overdue = billTone({ iso: "2026-09-03", urgent: true }, false, new Date(2026, 8, 19));
assert(overdue === "overdue", `WagePay tone was ${overdue}`);
const upcoming = billTone({ iso: "2026-09-27", urgent: true }, false, new Date(2026, 8, 19));
assert(upcoming === "urgent", `Beforepay tone was ${upcoming}`);

const plan = defaultPlan();
assertClose(remainingOneOffs(plan.debts), 191, "WagePay + Beforepay still open");
assert(plan.band === "bev-min", "default planning band is the floor");

const floorFree = floor.net - WEEKLY_CORE;
assert(floorFree > 400, `floor should clear the envelope with room, free was ${floorFree}`);

console.log("ok plan");
