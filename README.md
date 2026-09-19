# GreenLedger

Debt recovery plus hours and payslips, on **Bevchain** income.

**Live:** https://timesnapx.github.io/green-ledger/  
**Repo:** https://github.com/TimeSnapX/green-ledger

Combines [Debt-to-Green](https://github.com/TimeSnapX/debt-to-green) and [Pay Ledger](https://github.com/TimeSnapX/pay-ledger) into one app. Planning numbers assume the live role is **Bevchain HR multi-drop at $41.21/hr casual**. Budget to the **8h × 5 floor**. Overtime is snowball, not a new lifestyle.

This is a personal planning tool, not financial, legal, tax, or credit advice. It contains real balances and pay figures. Share the link only with people you are comfortable seeing that.

## What it does

- **Dashboard** — total debt, this week’s take-home, weekly free cash, freeze countdown, snowball target, logged hours.
- **Debts** — stack, balances, bill calendar. Ticks stay in this browser.
- **Budget** — Bevchain bands (floor / long 5-day / Sat OT / peak) against the same recovery envelope. First Express is kept as a comparison only.
- **Hours** — log a shift (weekday 8/10 OT, Saturday OT, rostered Saturday, Sunday). Same rates as Pay Ledger.
- **Payslips** — actual net is the source of truth. Files stay on this device.
- **Plan / ritual** — snowball order, payday steps, 30-day checklist.

If you log hours this week, the dashboard uses those hours (PAYG estimate). If a payslip covers the week, it uses actual net. Until then it uses the 8h × 5 floor (~$1,648.40 gross, ~$1,302.40 take-home).

## Snapshot (19 Sep 2026)

- Hardship freeze on until **19 Nov 2026**. ANZ card $250 + loan $300 restart that day.
- Bevchain floor: **$41.21 × 40h = $1,648.40** gross · PAYG scale 2 ~**$1,302.40** net.
- Freeze envelope ~**$835/wk** (rent, bills, food, fuel, smokes $12–$13/day, $70 cash, $50 savings, live lenders). Floor leftover ~**$467/wk** to the snowball.
- WagePay $138 was due 3 Sep. Beforepay ~$53 around 27 Sep. Mark them $0 in Debts when paid.

## Run locally

```powershell
.\start.ps1
```

Or:

```bash
python -m http.server 4175
```

Then open http://localhost:4175

Do not open `index.html` as `file://` — IndexedDB needs a normal origin.

## Data

- Hours, payslips, and PDFs: **IndexedDB** (`green-ledger`) in this browser.
- Debt ticks, balances, week logs: **localStorage**. If you used Debt-to-Green on the same origin, those ticks are imported once.
- Jobs → Import backup accepts a **Pay Ledger** JSON export as well as a GreenLedger backup.

Nothing is uploaded.

## Checks

```bash
node test-money.js
node test-tax.js
node test-plan.js
```

Hours calc is an **estimate only**. Payslips are take-home.
