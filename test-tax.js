import { paygWeekly, annualTax, weeklyNetFromGross } from "./js/tax.js";

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

function assertClose(actual, expected, label, tolerance = 0.02) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

assertEqual(paygWeekly(1500), 299, "PAYG $1,500");
assertEqual(paygWeekly(1800), 395, "PAYG $1,800");
assertEqual(paygWeekly(932), 116, "PAYG $932");
assertEqual(paygWeekly(1648.4), 346, "PAYG 40h week");
assertClose(weeklyNetFromGross(1648.4), 1302.4, "40h take-home");

const tax50k = annualTax(50000);
assertClose(tax50k.incomeTax, 5520 - 250, "income tax after LITO at $50k");
assertClose(tax50k.medicare, 1000, "medicare at $50k");

console.log("ok tax");
