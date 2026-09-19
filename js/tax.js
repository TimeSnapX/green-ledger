/**
 * 2026–27 Australian resident PAYG + annual tax helpers.
 * Planning estimates only — not a payslip or tax advice.
 */

export const TAX_YEAR = "2026–27";
export const SUPER_RATE = 0.12;

const SCALE2 = [
  { max: 362, a: 0, b: 0, nil: true },
  { max: 538, a: 0.15, b: 54.3462 },
  { max: 673, a: 0.25, b: 108.2135 },
  { max: 721, a: 0.17, b: 54.3473 },
  { max: 865, a: 0.179, b: 60.8377 },
  { max: 1282, a: 0.3227, b: 185.1935 },
  { max: 2596, a: 0.32, b: 181.7319 },
  { max: 3653, a: 0.39, b: 363.4627 },
  { max: Infinity, a: 0.47, b: 655.7704 },
];

export function roundNearestDollar(value) {
  if (value <= 0) return 0;
  return Math.floor(value + 0.5);
}

export function weeklyEarningsX(grossWeekly) {
  return Math.floor(grossWeekly) + 0.99;
}

function applyScale(grossWeekly, bands) {
  const x = weeklyEarningsX(grossWeekly);
  const band = bands.find((row) => x < row.max);
  if (!band || band.nil) return 0;
  return roundNearestDollar(band.a * x - band.b);
}

export function paygWeekly(grossWeekly) {
  return applyScale(grossWeekly, SCALE2);
}

export function weeklyNetFromGross(grossWeekly) {
  const gross = Number(grossWeekly) || 0;
  return Math.round((gross - paygWeekly(gross)) * 100) / 100;
}

export function incomeTax(taxable) {
  if (taxable <= 18200) return 0;
  if (taxable <= 45000) return 0.15 * (taxable - 18200);
  if (taxable <= 135000) return 4020 + 0.3 * (taxable - 45000);
  if (taxable <= 190000) return 31020 + 0.37 * (taxable - 135000);
  return 51370 + 0.45 * (taxable - 190000);
}

export function lito(taxable) {
  if (taxable <= 37500) return 700;
  if (taxable <= 45000) return 700 - 0.05 * (taxable - 37500);
  if (taxable <= 66667) return 325 - 0.015 * (taxable - 45000);
  return 0;
}

export function medicareLevy(taxable) {
  if (taxable <= 28011) return 0;
  if (taxable < 35013) return 0.1 * (taxable - 28011);
  return 0.02 * taxable;
}

export function annualTax(taxable, { hasPrivateHospital = true } = {}) {
  const offset = lito(taxable);
  const tax = Math.max(0, incomeTax(taxable) - offset);
  const medicare = medicareLevy(taxable);
  const mls = !hasPrivateHospital && taxable > 105000 ? 0.01 * taxable : 0;
  return {
    incomeTax: tax,
    medicare,
    mls,
    total: tax + medicare + mls,
  };
}
