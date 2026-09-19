import * as db from "./db.js";
import {
  AUD_EXACT,
  DAY_TYPES,
  dayTypeMeta,
  formatDay,
  formatDayShort,
  formatHours,
  formatSplit,
  fyEnd,
  fyLabel,
  fyStart,
  groupWeeks,
  hoursFromClock,
  hoursFromParts,
  inRange,
  roundCents,
  shiftPay,
  splitHours,
  suggestDayType,
  sumBy,
  toISODate,
  todayISO,
  weekEnd,
  weekStart,
} from "./money.js";
import { weeklyNetFromGross } from "./tax.js";
import {
  BEV_BANDS,
  BEV_RATE,
  BILLS,
  BUDGET_ROWS,
  CHECKLIST,
  FIRST_EXPRESS,
  HEAVY_WEEK,
  LEVERS,
  PATH,
  PHASES,
  PLANNING_BANDS,
  RITUAL_STEPS,
  SNOWBALL,
  STAGES,
  WEEKLY_CORE,
  WEEKLY_CORE_AFTER_ANZ,
  activeSnowball,
  bandById,
  billTone,
  freezeStatus,
  loadPlan,
  money,
  remainingOneOffs,
  roundMoney,
  savePlan,
  shortWhen,
  snowballStep,
  stageIndex,
  totalDebt,
  weeklyEnvelope,
} from "./plan.js";

const VIEWS = ["dashboard", "debts", "budget", "hours", "payslips", "plan", "ritual", "jobs"];

const state = {
  view: "dashboard",
  jobs: [],
  shifts: [],
  payslips: [],
  jobFilter: "all",
  monthFilter: "all",
  shiftMode: "duration",
  dayType: "weekday",
  pendingFile: null,
  existingFileName: "",
  plan: loadPlan(),
};

const els = {
  dashboard: document.querySelector("#view-dashboard"),
  debts: document.querySelector("#view-debts"),
  budget: document.querySelector("#view-budget"),
  hours: document.querySelector("#view-hours"),
  payslips: document.querySelector("#view-payslips"),
  plan: document.querySelector("#view-plan"),
  ritual: document.querySelector("#view-ritual"),
  jobs: document.querySelector("#view-jobs"),
  nav: document.querySelector("#nav"),
  shiftDlg: document.querySelector("#dlg-shift"),
  slipDlg: document.querySelector("#dlg-payslip"),
  jobDlg: document.querySelector("#dlg-job"),
  debtDlg: document.querySelector("#dlg-debt"),
  viewerDlg: document.querySelector("#dlg-viewer"),
  confirmDlg: document.querySelector("#dlg-confirm"),
  toast: document.querySelector("#toast"),
  drop: document.querySelector("#drop-zone"),
  dropLabel: document.querySelector("#drop-label"),
  fileInput: document.querySelector("#slip-file"),
  foot: document.querySelector("#sidebar-foot"),
};

let toastTimer = 0;
let objectUrl = "";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

function persistPlan() {
  savePlan(state.plan);
}

function jobById(id) {
  return state.jobs.find((j) => j.id === id);
}

function jobColor(id) {
  return jobById(id)?.color || "#3dd68c";
}

function toast(message) {
  clearTimeout(toastTimer);
  els.toast.hidden = false;
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
    els.toast.hidden = true;
  }, 2200);
}

async function confirmDelete(title, body, action = "Delete") {
  document.querySelector("#confirm-title").textContent = title;
  document.querySelector("#confirm-body").textContent = body;
  document.querySelector("#confirm-ok").textContent = action;
  els.confirmDlg.showModal();
  return new Promise((resolve) => {
    const onClose = () => {
      els.confirmDlg.removeEventListener("close", onClose);
      resolve(els.confirmDlg.returnValue === "ok");
    };
    els.confirmDlg.addEventListener("close", onClose);
  });
}

function filteredShifts() {
  return state.shifts.filter((s) => {
    if (state.jobFilter !== "all" && s.jobId !== state.jobFilter) return false;
    if (state.monthFilter !== "all" && s.date.slice(0, 7) !== state.monthFilter) return false;
    return true;
  });
}

function filteredPayslips() {
  return state.payslips.filter((p) => {
    if (state.jobFilter !== "all" && p.jobId !== state.jobFilter) return false;
    if (state.monthFilter !== "all" && p.payDate.slice(0, 7) !== state.monthFilter) return false;
    return true;
  });
}

function monthOptions() {
  const keys = new Set();
  for (const s of state.shifts) keys.add(s.date.slice(0, 7));
  for (const p of state.payslips) keys.add(p.payDate.slice(0, 7));
  return [...keys].sort().reverse();
}

function filterBar() {
  const months = monthOptions()
    .map((key) => {
      const [y, m] = key.split("-").map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
      return `<option value="${key}" ${state.monthFilter === key ? "selected" : ""}>${label}</option>`;
    })
    .join("");
  const jobs = state.jobs
    .map((j) => `<option value="${j.id}" ${state.jobFilter === j.id ? "selected" : ""}>${escapeHtml(j.name)}</option>`)
    .join("");
  return `
    <div class="filters">
      <select class="filter" data-filter="job" aria-label="Filter by job">
        <option value="all" ${state.jobFilter === "all" ? "selected" : ""}>All jobs</option>
        ${jobs}
      </select>
      <select class="filter" data-filter="month" aria-label="Filter by month">
        <option value="all" ${state.monthFilter === "all" ? "selected" : ""}>All months</option>
        ${months}
      </select>
    </div>`;
}

async function reload() {
  const [jobs, shifts, payslips] = await Promise.all([
    db.ensureDefaultJob(),
    db.all("shifts"),
    db.all("payslips"),
  ]);
  state.jobs = jobs.sort((a, b) => a.name.localeCompare(b.name));
  state.shifts = shifts
    .map(enrichShift)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
  state.payslips = payslips.sort((a, b) => b.payDate.localeCompare(a.payDate));
  render();
}

function enrichShift(s) {
  const dayType = s.dayType || suggestDayType(s.date);
  const calc = shiftPay(s.workedHours, s.breakMins, s.rate, dayType);
  const actualGross = s.actualGross ?? null;
  return {
    ...s,
    dayType,
    afterBreak: calc.afterBreak,
    paidHours: calc.paidHours,
    ordinaryHours: calc.ordinary,
    timeAndHalfHours: calc.timeAndHalf,
    doubleHours: calc.double,
    estGross: calc.estGross,
    gross: calc.estGross,
    minApplied: calc.minApplied,
    actualGross,
    actualNet: s.actualNet ?? null,
    variance: actualGross != null ? roundCents(actualGross - calc.estGross) : null,
  };
}

function moneyOrNull(id) {
  const raw = document.querySelector(id).value.trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? roundCents(n) : null;
}

function fillMoney(id, value) {
  document.querySelector(id).value = value == null || value === "" ? "" : value;
}

function setView(view) {
  if (!VIEWS.includes(view)) return;
  state.view = view;
  history.replaceState(null, "", `#/${view}`);
  render();
}

function rangeShifts(start, end) {
  return state.shifts.filter((s) => inRange(s.date, start, end));
}

function liveIncome(date = new Date()) {
  const ws = weekStart(date);
  const we = weekEnd(date);
  const weekShifts = rangeShifts(ws, we);
  const startISO = toISODate(ws);
  const endISO = toISODate(we);
  const weekSlips = state.payslips.filter((p) => {
    if (p.periodStart && p.periodEnd) return p.periodEnd >= startISO && p.periodStart <= endISO;
    return inRange(p.payDate, ws, we);
  });
  const band = bandById(state.plan.band);
  const loggedHours = sumBy(weekShifts, (s) => s.paidHours);
  const loggedGross = sumBy(weekShifts, (s) => s.estGross);
  const loggedNet = weekShifts.length ? weeklyNetFromGross(loggedGross) : 0;
  const days = weekShifts.length;
  const slips = weekSlips.length;

  if (weekSlips.length) {
    return {
      source: "payslip",
      label: "this week · actual net",
      net: sumBy(weekSlips, (p) => p.net),
      gross: sumBy(weekSlips, (p) => p.gross),
      hours: loggedHours,
      days,
      slips,
      loggedNet,
    };
  }
  // A half-built week is progress, not the number you live on.
  if (weekShifts.length && (weekShifts.length >= 4 || loggedHours >= 32)) {
    return {
      source: "hours",
      label: "this week · est. take-home",
      net: loggedNet,
      gross: loggedGross,
      hours: loggedHours,
      days,
      slips,
      loggedNet,
    };
  }
  return {
    source: "plan",
    label: `planning · ${band.name}`,
    net: band.net,
    gross: band.gross,
    hours: loggedHours,
    days,
    slips,
    loggedNet,
  };
}

function planningIncome() {
  return bandById(state.plan.band);
}

function weeklyFree(net, date = new Date()) {
  return roundCents((net || 0) - weeklyEnvelope(date));
}

function render() {
  for (const btn of els.nav.querySelectorAll("[data-view]")) {
    btn.classList.toggle("active", btn.dataset.view === state.view);
  }
  for (const view of VIEWS) {
    const el = document.querySelector(`#view-${view}`);
    if (el) el.classList.toggle("active", view === state.view);
  }
  renderFoot();
  if (state.view === "dashboard") renderDashboard();
  if (state.view === "debts") renderDebts();
  if (state.view === "budget") renderBudget();
  if (state.view === "hours") renderHours();
  if (state.view === "payslips") renderPayslips();
  if (state.view === "plan") renderPlan();
  if (state.view === "ritual") renderRitual();
  if (state.view === "jobs") renderJobs();
}

function renderFoot() {
  const freeze = freezeStatus();
  const income = liveIncome();
  els.foot.innerHTML = freeze.active
    ? `<strong>Freeze</strong> ${freeze.daysLeft} days to 19 Nov<br />This week ${money(roundMoney(income.net))} · ${escapeHtml(income.label)}<br />Budget to 8h × 5`
    : `<strong>ANZ mins are back</strong><br />This week ${money(roundMoney(income.net))}<br />Card $250 + loan $300`;
}

function bandSwitch() {
  return PLANNING_BANDS.map(
    (b) =>
      `<button type="button" data-band="${b.id}" class="${state.plan.band === b.id ? "active" : ""}">${escapeHtml(b.label)}</button>`,
  ).join("");
}

function renderDashboard() {
  const now = new Date();
  const freeze = freezeStatus(now);
  const income = liveIncome(now);
  const planBand = planningIncome();
  const total = totalDebt(state.plan.debts);
  const envelope = weeklyEnvelope(now);
  const free = weeklyFree(income.net, now);
  const weeks = freeze.active ? freeze.weeksLeft : 0;
  const stack = freeze.active ? roundMoney(free * freeze.weeksLeft) : 0;
  const oneOffs = remainingOneOffs(state.plan.debts);
  const target = activeSnowball(state.plan.debts);
  const currentStage = stageIndex(state.plan.debts);
  const compact = window.innerWidth < 700;
  const weekBars = groupWeeks(state.shifts, compact ? 6 : 12, now);
  const maxWeek = Math.max(1, ...weekBars.map((w) => w.gross));
  const upcoming = BILLS.filter((b) => b.urgent)
    .map((b) => ({ ...b, tone: billTone(b, !!state.plan.paidBills[b.id], now) }))
    .filter((b) => b.tone !== "paid")
    .slice(0, 5);
  const recentShifts = state.shifts.slice(0, 4);

  els.dashboard.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Dashboard</h2>
        <p class="sub">Bevchain $41.21/hr casual · live on the 8h × 5 floor</p>
      </div>
      <div class="toolbar">
        <span class="badge ${freeze.active ? "blue" : "amber"}">${
          freeze.active ? `Hardship freeze · ${freeze.daysLeft} days left` : "ANZ mins restarted"
        }</span>
        <button type="button" class="btn primary" data-open="shift">Log hours</button>
      </div>
    </div>

    <div class="hardship-banner">
      <h3>${freeze.active ? "Hardship freeze is on · Bevchain is the income" : "Freeze ended · ANZ minimums are live"}</h3>
      <p>
        Casual rate <strong style="color:var(--text)">$41.21/hr</strong>. The only safe live-on number is
        <strong style="color:var(--green)">8 hours × 5 days</strong>
        (~${money(roundMoney(BEV_BANDS[0].net))} take-home after PAYG). Overtime is acceleration for the snowball, not a new lifestyle.
        ${
          freeze.active
            ? `ANZ card and loan stay at $0 until <strong style="color:var(--text)">19 Nov 2026</strong>.`
            : `Card $250 and loan $300 are back in the envelope.`
        }
        Log shifts as you finish them so this dashboard uses real hours instead of the planning floor.
      </p>
      <div class="hardship-meta">
        <span class="badge green">Floor ${money(roundMoney(BEV_BANDS[0].net))} net</span>
        <span class="badge ${income.source === "plan" ? "amber" : "green"}">${escapeHtml(income.label)}</span>
        <span class="badge blue">Envelope ${money(roundMoney(envelope))}/wk</span>
      </div>
    </div>

    ${
      toISODate(now) <= HEAVY_WEEK.isoEnd
        ? `<div class="callout">
        <h3>Heavy week · ${escapeHtml(HEAVY_WEEK.when)}</h3>
        <p>
          On top of rent and the usual weekly lenders:
          ${HEAVY_WEEK.items.map((i) => `${escapeHtml(i.name)} ${money(i.amount)}`).join(" · ")}
          = <strong style="color:var(--text)">${money(HEAVY_WEEK.items.reduce((s, i) => s + i.amount, 0))}</strong>.
          Floor still covers it if smokes stay at the $120 cap and nothing else is added.
        </p>
      </div>`
        : ""
    }

    <div class="grid-stats">
      <div class="stat-card danger">
        <div class="label">Total debt</div>
        <div class="value">${money(total)}</div>
        <div class="hint">Small lenders, friends, ANZ</div>
      </div>
      <div class="stat-card ${income.source === "plan" ? "neutral" : "ok"}">
        <div class="label">${escapeHtml(income.label)}</div>
        <div class="value">${money(roundMoney(income.net))}</div>
        <div class="hint">${
          income.source === "hours"
            ? `${formatHours(income.hours)} paid · ${income.days} shift${income.days === 1 ? "" : "s"} · PAYG estimate`
            : income.source === "payslip"
              ? `${income.slips} slip${income.slips === 1 ? "" : "s"} this week · source of truth`
              : income.days
                ? `${formatHours(income.hours)} logged this week · still living on the floor until 4 days or a payslip`
                : `No hours logged yet · ${escapeHtml(planBand.hours)}`
        }</div>
      </div>
      <div class="stat-card ok">
        <div class="label">Weekly free</div>
        <div class="value">${money(roundMoney(free))}</div>
        <div class="hint">After ${money(roundMoney(envelope))} envelope${freeze.active ? " · ANZ $0" : " · ANZ back"}</div>
      </div>
      <div class="stat-card ${freeze.active ? "ok" : "warn"}">
        <div class="label">${freeze.active ? "Freeze stack left" : "From 19 Nov"}</div>
        <div class="value">${freeze.active ? money(stack) : money(roundMoney(weeklyFree(income.net, now)))}</div>
        <div class="hint">${
          freeze.active
            ? `${weeks} weeks · minus ${money(oneOffs)} still-open one-offs ≈ ${money(stack - oneOffs)}`
            : "Same take-home after card + loan mins"
        }</div>
      </div>
    </div>

    <div class="two-col">
      <div class="panel">
        <div class="panel-header">
          <h3>Upcoming / overdue</h3>
          <span class="meta">Tick paid on Debts</span>
        </div>
        <div class="due-list">
          ${
            upcoming.length
              ? upcoming
                  .map(
                    (b) => `
            <div class="due-item ${b.tone}">
              <div class="due-date">${escapeHtml(shortWhen(b.when))}</div>
              <div>
                <div class="due-name">${escapeHtml(b.name)}</div>
                <div class="due-note">${escapeHtml(b.note)} · ${escapeHtml(b.when)}</div>
              </div>
              <div class="due-amt">${money(b.amount)}</div>
            </div>`,
                  )
                  .join("")
              : `<p class="empty-hint">No urgent items left open.</p>`
          }
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">
          <h3>Snowball target</h3>
          <span class="meta">Extra cash → one target only</span>
        </div>
        <div class="snowball">
          <div class="snow-item current-target">
            <div class="snow-num">→</div>
            <div>
              <div class="snow-title">${escapeHtml(target.name)}</div>
              <div class="snow-why">Current attack target · ${money(target.balance)} left · ${escapeHtml(target.payment)}</div>
            </div>
          </div>
        </div>
        <p class="muted" style="margin-top:0.6rem">Pay every minimum on time. Leftover from the Bevchain floor (~${money(roundMoney(weeklyFree(BEV_BANDS[0].net, now)))}/wk) hits only this target.</p>
      </div>
    </div>

    <div class="charts" style="margin-bottom:1rem">
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Weekly est. gross</h3>
            <p>Logged hours · last ${weekBars.length} weeks</p>
          </div>
          <button class="btn" type="button" data-view="hours">Hours</button>
        </div>
        ${
          state.shifts.length
            ? `<div class="week-chart">${weekBars
                .map((w) => {
                  const h = Math.max(4, (w.gross / maxWeek) * 100);
                  return `<div class="week-col" title="${w.label}: ${AUD_EXACT.format(w.gross)}">
                    <div class="week-bar ${w.gross ? "" : "zero"}" style="height:${w.gross ? h : 4}%"></div>
                    <span>${w.label}</span>
                  </div>`;
                })
                .join("")}</div>`
            : `<p class="empty-hint">Log a shift and the week bars fill in. Until then the dashboard uses the 8h × 5 floor.</p>`
        }
      </div>
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Recent shifts</h3>
            <p>Tap a row to edit</p>
          </div>
        </div>
        <div class="list">
          ${recentShifts.length ? recentShifts.map(shiftRow).join("") : `<p class="muted">No hours logged yet.</p>`}
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h3>Recovery stages</h3>
        <span class="meta">Concrete “done” definitions</span>
      </div>
      <div class="stages">
        ${STAGES.map(
          (s, i) => `
          <div class="stage ${i === currentStage ? "current" : i < currentStage ? "done" : ""}">
            <div class="stage-num">Stage ${i + 1}</div>
            <h4>${s.name}</h4>
            <p>${s.def}</p>
          </div>`,
        ).join("")}
      </div>
    </div>
  `;
}

function renderDebts() {
  const total = totalDebt(state.plan.debts);
  const now = new Date();
  els.debts.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Bills &amp; debts</h2>
        <p class="sub">Priority stack · update balances as you pay down</p>
      </div>
      <span class="badge red">Total: ${money(total)}</span>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h3>Debt stack</h3>
        <span class="meta">Pay every minimum · extra hits current snowball only</span>
      </div>
      <div class="debt-list" id="debt-list">
        ${state.plan.debts
          .slice()
          .sort((a, b) => a.priority - b.priority)
          .map((d) => {
            const pct = d.original > 0 ? Math.max(0, Math.min(100, ((d.original - Math.max(0, d.balance)) / d.original) * 100)) : 0;
            const paid = d.balance <= 0;
            return `
            <div class="debt-row ${paid ? "paid" : ""}">
              <div class="priority ${d.hot && !paid ? "hot" : ""}">${d.priority}</div>
              <div>
                <div class="debt-name">${escapeHtml(d.name)}${paid ? " · CLEARED" : ""}</div>
                <div class="debt-meta">${escapeHtml(d.role)}</div>
                <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
                <div class="debt-actions">
                  <button type="button" class="btn" data-action="edit" data-id="${d.id}">Edit balance</button>
                  ${
                    paid
                      ? `<button type="button" class="btn ghost" data-action="restore" data-id="${d.id}">Restore</button>`
                      : `<button type="button" class="btn primary" data-action="clear" data-id="${d.id}">Mark $0</button>`
                  }
                </div>
              </div>
              <div class="debt-amounts">
                <div class="debt-balance">${money(Math.max(0, d.balance))}</div>
                <div class="debt-payment">${escapeHtml(d.payment)}</div>
              </div>
            </div>`;
          })
          .join("")}
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h3>Bill calendar</h3>
        <span class="meta">Recurring + one-offs from the plan</span>
      </div>
      <div class="due-list" id="bill-calendar">
        ${BILLS.map((b) => {
          const paid = !!state.plan.paidBills[b.id];
          const tone = billTone(b, paid, now);
          return `
          <div class="due-item ${tone} ${paid ? "paid-off" : ""}">
            <div class="due-date">${escapeHtml(shortWhen(b.when))}</div>
            <div>
              <div class="due-name">${escapeHtml(b.name)}${paid ? " ✓" : ""}${tone === "overdue" ? " · overdue" : ""}</div>
              <div class="due-note">${escapeHtml(b.note)} · ${escapeHtml(b.when)}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.35rem;">
              <div class="due-amt">${money(b.amount)}</div>
              <button type="button" class="btn ${paid ? "ghost" : "primary"}" data-bill="${b.id}" style="font-size:0.7rem;padding:0.3rem 0.5rem;">
                ${paid ? "Undo" : "Paid"}
              </button>
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderBudget() {
  const now = new Date();
  const freeze = freezeStatus(now);
  const band = planningIncome();
  const live = liveIncome(now);
  const net = band.net;
  const free = weeklyFree(net, now);
  const afterAnz = net - WEEKLY_CORE_AFTER_ANZ;
  const freezeStack = freeze.active ? roundMoney(free * freeze.weeksLeft) : roundMoney(free * 13);

  els.budget.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Weekly budget</h2>
        <p class="sub">Bevchain take-home · same recovery envelope · overtime is snowball</p>
      </div>
      <span class="badge green">Live on the floor</span>
    </div>

    <div class="scenario-switch" style="margin-bottom:1rem">${bandSwitch()}</div>

    <div class="hardship-banner">
      <h3>Budget to 8h × 5 until payslips prove more</h3>
      <p>
        Floor take-home is about <strong style="color:var(--text)">${money(roundMoney(BEV_BANDS[0].net))}</strong> a week
        (PAYG scale 2, no HELP). That is the number rent, smokes, and minimums have to fit.
        ${
          live.source !== "plan"
            ? `This week is logged at <strong style="color:var(--green)">${money(roundMoney(live.net))}</strong> (${escapeHtml(live.label)}).`
            : live.days
              ? `This week has ${live.days} shift${live.days === 1 ? "" : "s"} so far (~${money(roundMoney(live.loggedNet))} est. take-home). Live on the floor until four days or a payslip.`
              : "Log hours and this page will show the real week next to the planning band."
        }
        Fuel is <strong style="color:var(--text)">$120/wk minimum</strong>. Smokes are a <strong style="color:var(--text)">$120/wk cap</strong>. Extra days are not a reason to loosen either.
      </p>
    </div>

    <div class="role-grid">
      <div class="role-card">
        <div class="role-kicker">Income · live role</div>
        <h3>Bevchain · HR Delivery Driver</h3>
        <p class="role-sub">Casual $41.21/hr · budget to the 8h × 5 floor · OT after 8h / weekend rates from Pay Ledger</p>
        <div class="fact-grid">
          <div class="fact"><div class="k">Casual rate</div><div class="v">$41.21</div><div class="h">Loaded casual</div></div>
          <div class="fact"><div class="k">Safe floor</div><div class="v">8h × 5</div><div class="h">40h ordinary</div></div>
          <div class="fact"><div class="k">Floor net</div><div class="v">${money(roundMoney(BEV_BANDS[0].net))}</div><div class="h">PAYG ~${money(BEV_BANDS[0].tax)} withheld</div></div>
          <div class="fact"><div class="k">Floor free</div><div class="v">${money(roundMoney(weeklyFree(BEV_BANDS[0].net, now)))}</div><div class="h">After ${money(roundMoney(weeklyEnvelope(now)))} envelope</div></div>
        </div>
        <div class="band-list">
          ${BEV_BANDS.map(
            (b) => `
            <div class="band ${b.kind === "floor" ? "floor" : b.kind === "peak" ? "peak" : ""}">
              <div>
                <div class="band-name">${escapeHtml(b.name)}</div>
                <div class="band-hours">${escapeHtml(b.hours)}</div>
              </div>
              <div>
                <div class="band-pay">${money(roundMoney(b.gross))} gross</div>
                <div class="band-net">~${money(roundMoney(b.net))} net · ${money(roundMoney(weeklyFree(b.net, now)))} free</div>
              </div>
            </div>`,
          ).join("")}
        </div>
        <ul class="note-list">
          <li>Net uses ATO PAYG withholding scale 2 for 2026–27. Confirm the first payslip.</li>
          <li>Saturday overtime is first 2h at 1.5× then 2×, with a 4-hour minimum. Sunday is all 2×.</li>
          <li>Do not budget lifestyle to the 6-day or 7-day bands. Casual means a quiet week can drop back to the floor.</li>
        </ul>
      </div>
      <div class="role-card alt">
        <div class="role-kicker">Old path · comparison only</div>
        <h3>First Express Couriers</h3>
        <p class="role-sub">Previous role · $27.63/hr · 5-day mid ~${money(FIRST_EXPRESS.weeklyNet)}</p>
        <div class="fact-grid">
          <div class="fact"><div class="k">Hourly</div><div class="v">$27.63</div><div class="h">Ordinary</div></div>
          <div class="fact"><div class="k">5-day net</div><div class="v">$1,125</div><div class="h">Range $1,100–$1,150</div></div>
        </div>
        <ul class="note-list">
          <li>Kept here so the jump is visible: floor Bevchain take-home is ~${money(roundMoney(BEV_BANDS[0].net - FIRST_EXPRESS.weeklyNet))} a week above the old 5-day mid.</li>
          <li>That extra is for the snowball, not smokes or cash.</li>
        </ul>
      </div>
    </div>

    <div class="grid-stats">
      <div class="stat-card neutral">
        <div class="label">Selected band net</div>
        <div class="value">${money(roundMoney(net))}</div>
        <div class="hint">${escapeHtml(band.name)} · ${escapeHtml(band.hours)}</div>
      </div>
      <div class="stat-card warn">
        <div class="label">From 19 Nov (ANZ back)</div>
        <div class="value">${money(roundMoney(afterAnz))}</div>
        <div class="hint">Same band + $127/wk card &amp; loan</div>
      </div>
      <div class="stat-card ok">
        <div class="label">Weekly free now</div>
        <div class="value">${money(roundMoney(free))}</div>
        <div class="hint">Envelope ${money(roundMoney(weeklyEnvelope(now)))}</div>
      </div>
      <div class="stat-card ${live.days || live.slips ? "ok" : "neutral"}">
        <div class="label">This week logged</div>
        <div class="value">${live.days || live.slips ? money(roundMoney(live.source === "plan" ? live.loggedNet : live.net)) : "—"}</div>
        <div class="hint">${
          live.days || live.slips
            ? `${formatHours(live.hours || 0)} · ${live.days} shift${live.days === 1 ? "" : "s"}`
            : "No shifts yet this week"
        }</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h3>Category breakdown</h3>
        <span class="meta">Old First Express week vs selected Bevchain band</span>
      </div>
      <div class="table-wrap">
        <table class="budget-table">
          <thead>
            <tr>
              <th>Category</th>
              <th class="num">Old / wk</th>
              <th class="num">Bevchain / wk</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${BUDGET_ROWS.map((r) => {
              if (r.income) {
                return `<tr>
                  <td style="color:var(--text)">${escapeHtml(r.cat)}</td>
                  <td class="num">${money(FIRST_EXPRESS.weeklyNet)}</td>
                  <td class="num">${money(roundMoney(net))}</td>
                  <td>${escapeHtml(band.name)} · ${escapeHtml(band.note)}</td>
                </tr>`;
              }
              const notes = r.cat === "Debt attack / buffer"
                ? `Minimum $60 · this band can send ${money(roundMoney(free))} to the snowball`
                : r.notes;
              const cutClass = r.cut && r.neu < r.old ? "cut" : "hold";
              return `<tr>
                <td style="color:var(--text)">${escapeHtml(r.cat)}</td>
                <td class="num">${money(r.old)}</td>
                <td class="num ${cutClass}">${money(r.neu)}</td>
                <td>${escapeHtml(notes)}</td>
              </tr>`;
            }).join("")}
            <tr class="result">
              <td>RESULT in freeze (to 19 Nov)</td>
              <td class="num">${money(FIRST_EXPRESS.weeklyNet - WEEKLY_CORE)}</td>
              <td class="num">${money(roundMoney(net - WEEKLY_CORE))}</td>
              <td>ANZ paused · live lenders + real smokes</td>
            </tr>
            <tr>
              <td style="color:var(--text)">RESULT from 19 Nov (ANZ back)</td>
              <td class="num">${money(FIRST_EXPRESS.weeklyNet - WEEKLY_CORE_AFTER_ANZ)}</td>
              <td class="num">${money(roundMoney(afterAnz))}</td>
              <td>Card $250 + loan $300 resume — envelope must already stick</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h3>Lifestyle levers</h3>
        <span class="meta">Do not cut food/fuel below what work needs</span>
      </div>
      <div class="table-wrap">
        <table class="budget-table">
          <thead>
            <tr>
              <th>Line item</th>
              <th class="num">Now</th>
              <th class="num">Recovery</th>
              <th class="num">Saved</th>
              <th>How</th>
            </tr>
          </thead>
          <tbody>
            ${LEVERS.map(
              (l) => `<tr>
              <td style="color:var(--text)">${escapeHtml(l.item)}</td>
              <td class="num">${typeof l.now === "number" ? money(l.now) : l.now}</td>
              <td class="num">${typeof l.rec === "number" ? money(l.rec) : l.rec}</td>
              <td class="num cut">${typeof l.saved === "number" ? money(l.saved) : l.saved}</td>
              <td>${escapeHtml(l.how)}</td>
            </tr>`,
            ).join("")}
            <tr class="result">
              <td>TOTAL freed (freeze)</td>
              <td class="num"></td>
              <td class="num"></td>
              <td class="num">~$212/wk</td>
              <td>$127 ANZ pause is temporary — gone 19 Nov. Allowance + savings cuts stay.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function shiftRow(s) {
  const job = jobById(s.jobId);
  const day = dayTypeMeta(s.dayType).label;
  const varText =
    s.variance != null ? ` · var ${s.variance >= 0 ? "+" : "−"}${AUD_EXACT.format(Math.abs(s.variance))}` : "";
  const netText = s.actualNet != null ? `<small>net ${AUD_EXACT.format(s.actualNet)}</small>` : `<small>est. gross</small>`;
  return `
    <button class="row" type="button" data-edit-shift="${s.id}">
      <span class="dot" style="background:${jobColor(s.jobId)}"></span>
      <span>
        <b>${formatDay(s.date)}</b>
        <small>${escapeHtml(job?.name || "Job")} · ${escapeHtml(day)} · worked ${formatHours(s.afterBreak ?? s.workedHours)} · paid ${formatHours(s.paidHours)} · ${formatSplit({ ordinary: s.ordinaryHours, timeAndHalf: s.timeAndHalfHours, double: s.doubleHours })}${varText}</small>
      </span>
      <span class="money">${AUD_EXACT.format(s.estGross)}${netText}</span>
    </button>
  `;
}

function slipRow(p) {
  const job = jobById(p.jobId);
  return `
    <button class="row" type="button" data-edit-slip="${p.id}">
      <span class="dot" style="background:${jobColor(p.jobId)}"></span>
      <span>
        <b>Paid ${formatDayShort(p.payDate)}</b>
        <small>${escapeHtml(job?.name || "Job")}${p.fileId ? " · file on record" : ""}</small>
      </span>
      <span class="money">${AUD_EXACT.format(p.net || 0)}<small>net</small></span>
    </button>
  `;
}

function renderHours() {
  const rows = filteredShifts();
  const totalH = sumBy(rows, (s) => s.paidHours);
  const totalG = sumBy(rows, (s) => s.gross);
  els.hours.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Hours</h2>
        <p class="sub">${rows.length} shift${rows.length === 1 ? "" : "s"} · ${formatHours(totalH)} paid · est. ${AUD_EXACT.format(totalG)}</p>
      </div>
      <div class="toolbar">
        ${filterBar()}
        <button class="btn primary" type="button" data-open="shift">Log hours</button>
      </div>
    </div>
    ${
      rows.length
        ? `<div class="list hours-cards">${rows.map(shiftRow).join("")}</div>
           <div class="panel table-wrap hours-table"><table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Day</th>
                <th>Worked</th>
                <th>Paid</th>
                <th>1.0×</th>
                <th>1.5×</th>
                <th>2×</th>
                <th>Est. gross</th>
                <th>Actual net</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (s) => `
                    <tr>
                      <td>${formatDay(s.date)}</td>
                      <td>${escapeHtml(dayTypeMeta(s.dayType).label)}</td>
                      <td>${formatHours(s.afterBreak ?? s.workedHours)}${s.start && s.end ? ` <small class="muted">${s.start}–${s.end}</small>` : ""}</td>
                      <td>${formatHours(s.paidHours)}</td>
                      <td>${s.ordinaryHours ? formatHours(s.ordinaryHours) : "—"}</td>
                      <td>${s.timeAndHalfHours ? formatHours(s.timeAndHalfHours) : "—"}</td>
                      <td>${s.doubleHours ? formatHours(s.doubleHours) : "—"}</td>
                      <td>${AUD_EXACT.format(s.estGross)}</td>
                      <td>${s.actualNet != null ? AUD_EXACT.format(s.actualNet) : "—"}</td>
                      <td><button class="row-link" type="button" data-edit-shift="${s.id}">Edit</button></td>
                    </tr>`,
                )
                .join("")}
            </tbody>
          </table></div>`
        : `<div class="empty">
            <h2>Log the first Bevchain shift</h2>
            <p>Pick weekday, Saturday overtime, Saturday ordinary, or Sunday. Est. gross is an estimate — payslips are take-home. Dashboard uses these hours as this week’s income.</p>
            <button class="btn primary" type="button" data-open="shift">Log hours</button>
          </div>`
    }
  `;
}

function reconcile(slip) {
  if (!slip.periodStart || !slip.periodEnd) return null;
  const rows = state.shifts.filter(
    (s) => s.jobId === slip.jobId && s.date >= slip.periodStart && s.date <= slip.periodEnd,
  );
  const logged = sumBy(rows, (s) => s.estGross);
  const hours = sumBy(rows, (s) => s.paidHours);
  const delta = roundCents(Number(slip.gross || 0) - logged);
  return { logged, hours, delta, days: rows.length };
}

function renderPayslips() {
  const rows = filteredPayslips();
  els.payslips.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Payslips</h2>
        <p class="sub">${rows.length} on file · take-home ${AUD_EXACT.format(sumBy(rows, (p) => p.net))}</p>
      </div>
      <div class="toolbar">
        ${filterBar()}
        <button class="btn primary" type="button" data-open="payslip">Add payslip</button>
      </div>
    </div>
    ${
      rows.length
        ? `<div class="payslip-grid">
            ${rows
              .map((p) => {
                const job = jobById(p.jobId);
                const rec = reconcile(p);
                let recHtml = "";
                if (rec) {
                  if (!rec.days) recHtml = `<p class="reconcile">No hours logged in ${formatDayShort(p.periodStart)}–${formatDayShort(p.periodEnd)}</p>`;
                  else if (Math.abs(rec.delta) < 0.5) recHtml = `<p class="reconcile ok">Actual gross matches ${rec.days} shift${rec.days === 1 ? "" : "s"} est. (${formatHours(rec.hours)})</p>`;
                  else recHtml = `<p class="reconcile off">Variance actual − est. ${rec.delta >= 0 ? "+" : "−"}${AUD_EXACT.format(Math.abs(rec.delta))} · est. ${AUD_EXACT.format(rec.logged)}</p>`;
                }
                const period = p.periodStart && p.periodEnd ? `${formatDayShort(p.periodStart)} – ${formatDayShort(p.periodEnd)}` : "Period not set";
                return `
                  <button class="panel slip" type="button" data-edit-slip="${p.id}">
                    <p class="eyebrow">${escapeHtml(job?.name || "Job")}</p>
                    <h3>Paid ${formatDay(p.payDate)}</h3>
                    <p class="muted">${period}</p>
                    <p class="stat-value">${AUD_EXACT.format(p.net || 0)}</p>
                    <p class="muted">actual net · actual gross ${AUD_EXACT.format(p.gross || 0)}</p>
                    <p class="muted">tax ${AUD_EXACT.format(p.tax || 0)} · super ${AUD_EXACT.format(p.super || 0)}${p.deductions ? ` · other ${AUD_EXACT.format(p.deductions)}` : ""}</p>
                    <span class="file-chip ${p.fileId ? "" : "missing"}">${p.fileId ? "PDF / file stored" : "No file attached"}</span>
                    ${recHtml}
                  </button>`;
              })
              .join("")}
          </div>`
        : `<div class="empty">
            <h2>Keep the PDF here</h2>
            <p>Upload each Bevchain payslip when it lands. Enter gross, tax, and net so take-home is tracked against the hours you logged. Actual net is never overwritten by the hours calculator.</p>
            <button class="btn primary" type="button" data-open="payslip">Add payslip</button>
          </div>`
    }
  `;
}

function renderPlan() {
  const target = activeSnowball(state.plan.debts);
  const currentStep = snowballStep(target);
  const freeze = freezeStatus();
  els.plan.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Recovery plan</h2>
        <p class="sub">Bevchain floor · hardship freeze ${freeze.active ? `${freeze.daysLeft} days left` : "ended"} · one snowball target</p>
      </div>
    </div>
    <div class="two-col">
      <div class="panel">
        <div class="panel-header">
          <h3>Phases</h3>
          <span class="meta">Restart the same week if you slip</span>
        </div>
        <div class="timeline">
          ${PHASES.map(
            (p) => `
            <div class="phase ${p.status === "active" ? "active" : ""}">
              <h4>${escapeHtml(p.title)}</h4>
              <div class="when">${escapeHtml(p.when)} · ${escapeHtml(p.goal)}</div>
              <ul>${p.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
            </div>`,
          ).join("")}
        </div>
      </div>
      <div>
        <div class="panel">
          <div class="panel-header">
            <h3>Debt snowball order</h3>
            <span class="meta">Extra → ONE target</span>
          </div>
          <div class="snowball">
            ${SNOWBALL.map(
              (s) => `
              <div class="snow-item ${s.n === currentStep ? "current-target" : ""}">
                <div class="snow-num">${s.n}</div>
                <div>
                  <div class="snow-title">${escapeHtml(s.target)}${s.n === currentStep ? " · active" : ""}</div>
                  <div class="snow-why">${escapeHtml(s.why)} · Extra starts: ${escapeHtml(s.when)}</div>
                </div>
              </div>`,
            ).join("")}
          </div>
        </div>
        <div class="panel">
          <div class="panel-header">
            <h3>Rough path to green</h3>
            <span class="meta">Illustrative — not a guarantee</span>
          </div>
          <div class="due-list">
            ${PATH.map(
              (p) => `
              <div class="due-item">
                <div class="due-date" style="color:var(--green)">${escapeHtml(p.period)}</div>
                <div>
                  <div class="due-name">${escapeHtml(p.focus)}</div>
                  <div class="due-note">${escapeHtml(p.pos)}</div>
                </div>
              </div>`,
            ).join("")}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderRitual() {
  const done = state.plan.checks.filter(Boolean).length;
  const logs = (state.plan.weekLogs || []).slice().reverse().slice(0, 8);
  els.ritual.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Payday ritual</h2>
        <p class="sub">15 minutes every payday · Bevchain · log the week</p>
      </div>
      <span class="badge blue">Weekly habit</span>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h3>Payday checklist</h3>
        <span class="meta">Same order every week</span>
      </div>
      <div class="ritual-steps">
        ${RITUAL_STEPS.map((s) => `<div class="ritual-step"><p>${escapeHtml(s)}</p></div>`).join("")}
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h3>This week’s log</h3>
        <span class="meta">Saved in this browser only</span>
      </div>
      <div class="field" style="margin-bottom:0.85rem">
        <label for="week-status">Status</label>
        <select id="week-status">
          <option value="">— Select —</option>
          <option value="on">On plan</option>
          <option value="off">Off plan</option>
        </select>
      </div>
      <div class="field" style="margin-bottom:0.85rem">
        <label for="week-note">One sentence why</label>
        <input type="text" id="week-note" placeholder="e.g. Worked Saturday, stuck to smoke cap" />
      </div>
      <button type="button" class="btn primary" id="btn-save-week">Save week log</button>
      <div id="week-history" style="margin-top:1rem">
        ${
          logs.length
            ? logs
                .map(
                  (log) => `
            <div class="due-item" style="margin-bottom:0.4rem">
              <div class="due-date" style="color:${log.status === "on" ? "var(--green)" : "var(--red)"}">${log.status === "on" ? "ON" : "OFF"}</div>
              <div>
                <div class="due-name">${escapeHtml(log.date)}</div>
                <div class="due-note">${escapeHtml(log.note || "—")}</div>
              </div>
            </div>`,
                )
                .join("")
            : `<p class="empty-hint">No week logs yet — save after payday ritual.</p>`
        }
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h3>30-day action checklist</h3>
        <span class="count">${done} / ${CHECKLIST.length}</span>
      </div>
      <div class="progress-banner">
        <span>Progress: <span class="count">${done} / ${CHECKLIST.length}</span></span>
        <button type="button" class="btn ghost" id="btn-clear-checks">Clear all</button>
      </div>
      <div class="check-list" id="checklist">
        ${CHECKLIST.map(
          (text, i) => `
          <div class="check-item ${state.plan.checks[i] ? "done" : ""}" data-check="${i}">
            <div class="check-box">${state.plan.checks[i] ? "✓" : ""}</div>
            <div class="check-text">${escapeHtml(text)}</div>
          </div>`,
        ).join("")}
      </div>
    </div>
    <div class="panel">
      <div class="panel-header"><h3>If a week goes wrong</h3></div>
      <ul class="note-list">
        <li>One bad week is normal. Two in a row → change something concrete (extra Saturday, lower smokes, pause non-essential).</li>
        <li>Never “catch up” with another payday loan or unfreezing locked accounts for wants.</li>
        <li>ANZ stays $0 until 19 Nov. After that, missing the restarted $250 / $300 is how the freeze unravels.</li>
      </ul>
      <div class="helpline">
        <div>
          <div class="phone">1800 007 007</div>
          <p>National Debt Helpline (AU) · free, confidential financial counselling</p>
        </div>
      </div>
    </div>
    <p class="disclaimer">
      Personal planning tool combining Debt-to-Green and Pay Ledger. Bevchain figures use $41.21/hr casual and 2026–27 PAYG scale 2 (no HELP).
      Hours are estimates. Payslips are take-home. Not financial, legal, tax, or credit advice.
      Free help: National Debt Helpline <strong>1800 007 007</strong>.
      Progress stays in this browser.
    </p>
  `;
}

function renderJobs() {
  const now = new Date();
  const fy = fyLabel(now);
  const fyShifts = rangeShifts(fyStart(now), fyEnd(now));
  const fySlips = state.payslips.filter((p) => inRange(p.payDate, fyStart(now), fyEnd(now)));
  els.jobs.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Jobs</h2>
        <p class="sub">${fy} · ${formatHours(sumBy(fyShifts, (s) => s.paidHours))} logged · ${fySlips.length} slip${fySlips.length === 1 ? "" : "s"}</p>
      </div>
      <button class="btn primary" type="button" data-open="job">Add job</button>
    </div>
    <div class="job-grid">
      ${state.jobs
        .map((j) => {
          const shifts = state.shifts.filter((s) => s.jobId === j.id);
          return `
            <button class="panel job-card" type="button" data-edit-job="${j.id}">
              <span class="dot" style="background:${j.color}"></span>
              <h3>${escapeHtml(j.name)}</h3>
              <p class="stat-value">${AUD_EXACT.format(j.rate)} <span style="font-size:14px;color:var(--text-muted);font-weight:500">/hr</span></p>
              <p class="muted">${j.breakMins} min unpaid break · ${shifts.length} shift${shifts.length === 1 ? "" : "s"}</p>
            </button>`;
        })
        .join("")}
    </div>
    <div class="jobs-tools">
      <button class="btn" type="button" id="export-json">Export backup</button>
      <button class="btn" type="button" id="export-csv">Export hours CSV</button>
      <label class="btn" style="cursor:pointer">
        Import backup
        <input id="import-json" type="file" accept="application/json" hidden />
      </label>
    </div>
    <p class="note">Import accepts GreenLedger or Pay Ledger backups. Payslip files stay on this device. Clearing the browser wipes the ledger. Debt ticks live in local storage separately.</p>
  `;
}

function fillJobSelects(selected) {
  const html = state.jobs
    .map((j) => `<option value="${j.id}" ${j.id === selected ? "selected" : ""}>${escapeHtml(j.name)}</option>`)
    .join("");
  document.querySelector("#shift-job").innerHTML = html;
  document.querySelector("#slip-job").innerHTML = html;
}

function setShiftMode(mode) {
  state.shiftMode = mode;
  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.mode === mode));
  });
  document.querySelector("#duration-fields").hidden = mode !== "duration";
  document.querySelector("#clock-fields").hidden = mode !== "clock";
  updateShiftPreview();
}

function setDayType(type, { fromDate = false } = {}) {
  const next = DAY_TYPES.some((t) => t.id === type) ? type : "weekday";
  if (fromDate) {
    const sat = (t) => t === "sat-ot" || t === "sat-ordinary";
    if (sat(next) && sat(state.dayType)) return;
  }
  state.dayType = next;
  document.querySelectorAll("[data-day-type]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.dayType === next));
  });
  updateShiftPreview();
}

function currentWorkedHours() {
  if (state.shiftMode === "clock") {
    return hoursFromClock(document.querySelector("#shift-start").value, document.querySelector("#shift-end").value);
  }
  return hoursFromParts(document.querySelector("#shift-h").value, document.querySelector("#shift-m").value);
}

function updateShiftPreview() {
  const worked = currentWorkedHours();
  const brk = Number(document.querySelector("#shift-break").value) || 0;
  const rate = Number(document.querySelector("#shift-rate").value) || 0;
  const calc = shiftPay(worked, brk, rate, state.dayType);
  document.querySelector("#shift-worked").textContent = formatHours(calc.afterBreak);
  document.querySelector("#shift-paid").textContent = formatHours(calc.paidHours);
  document.querySelector("#shift-gross").textContent = AUD_EXACT.format(calc.estGross);
  let note = formatSplit(calc);
  if (calc.minApplied) note += ` · ${formatHours(calc.paidHours)} minimum applied (worked ${formatHours(calc.afterBreak)})`;
  document.querySelector("#shift-ot-note").textContent = calc.paidHours ? note : "1.0× / 1.5× / 2× split";
  return { ...calc, rate, brk };
}

function openShift(shift) {
  fillJobSelects(shift?.jobId || state.jobs[0]?.id);
  document.querySelector("#shift-id").value = shift?.id || "";
  const date = shift?.date || todayISO();
  document.querySelector("#shift-date").value = date;
  document.querySelector("#shift-break").value = shift?.breakMins ?? state.jobs[0]?.breakMins ?? 30;
  document.querySelector("#shift-rate").value = shift?.rate ?? state.jobs[0]?.rate ?? BEV_RATE;
  document.querySelector("#shift-notes").value = shift?.notes || "";
  document.querySelector("#shift-start").value = shift?.start || "";
  document.querySelector("#shift-end").value = shift?.end || "";
  fillMoney("#shift-actual-gross", shift?.actualGross);
  fillMoney("#shift-actual-net", shift?.actualNet);
  fillMoney("#shift-actual-tax", shift?.actualTax);
  fillMoney("#shift-actual-super", shift?.actualSuper);
  fillMoney("#shift-actual-deductions", shift?.actualDeductions);
  const parts = splitHours(shift?.workedHours || 0);
  document.querySelector("#shift-h").value = parts.h;
  document.querySelector("#shift-m").value = parts.m;
  document.querySelector("#shift-delete").hidden = !shift;
  document.querySelector("#shift-kicker").textContent = shift ? "Edit shift" : "New shift";
  document.querySelector("#shift-title").textContent = shift ? formatDay(shift.date) : "Log hours";
  const more = document.querySelector("#shift-form details");
  more.open = Boolean(shift && (shift.actualNet != null || shift.actualGross != null));
  setDayType(shift?.dayType || suggestDayType(date));
  setShiftMode(shift?.start && shift?.end ? "clock" : "duration");
  els.shiftDlg.showModal();
  updateShiftPreview();
}

function openPayslip(slip) {
  fillJobSelects(slip?.jobId || state.jobs[0]?.id);
  document.querySelector("#slip-id").value = slip?.id || "";
  document.querySelector("#slip-paydate").value = slip?.payDate || todayISO();
  document.querySelector("#slip-start").value = slip?.periodStart || toISODate(weekStart(new Date()));
  document.querySelector("#slip-end").value = slip?.periodEnd || toISODate(weekEnd(new Date()));
  fillMoney("#slip-gross", slip?.gross);
  fillMoney("#slip-tax", slip?.tax);
  fillMoney("#slip-net", slip?.net);
  fillMoney("#slip-super", slip?.super);
  fillMoney("#slip-deductions", slip?.deductions);
  document.querySelector("#slip-notes").value = slip?.notes || "";
  document.querySelector("#slip-file").value = "";
  state.pendingFile = null;
  state.existingFileName = slip?.fileName || "";
  els.dropLabel.textContent = slip?.fileName ? `On file: ${slip.fileName} — drop to replace` : "Drop a PDF or photo of the payslip";
  document.querySelector("#slip-delete").hidden = !slip;
  document.querySelector("#slip-view").hidden = !slip?.fileId;
  document.querySelector("#slip-kicker").textContent = slip ? "Edit payslip" : "Payslip vault";
  document.querySelector("#slip-title").textContent = slip ? `Paid ${formatDay(slip.payDate)}` : "Add payslip";
  els.slipDlg.showModal();
}

function openJob(job) {
  document.querySelector("#job-id").value = job?.id || "";
  document.querySelector("#job-name").value = job?.name || "";
  document.querySelector("#job-rate").value = job?.rate ?? BEV_RATE;
  document.querySelector("#job-break").value = job?.breakMins ?? 30;
  document.querySelector("#job-color").value = job?.color || "#3dd68c";
  document.querySelector("#job-delete").hidden = !job;
  document.querySelector("#job-title").textContent = job ? job.name : "New job";
  els.jobDlg.showModal();
}

function openDebt(debt) {
  document.querySelector("#debt-id").value = debt.id;
  document.querySelector("#debt-title").textContent = `Update · ${debt.name}`;
  document.querySelector("#debt-balance").value = debt.balance;
  els.debtDlg.showModal();
  document.querySelector("#debt-balance").focus();
}

async function saveShift(event) {
  event.preventDefault();
  const preview = updateShiftPreview();
  if (preview.paidHours <= 0) {
    toast("Paid hours came out at zero — check time on site and the break.");
    return;
  }
  const id = document.querySelector("#shift-id").value || db.uid();
  const existing = state.shifts.find((s) => s.id === id);
  const record = {
    id,
    jobId: document.querySelector("#shift-job").value,
    date: document.querySelector("#shift-date").value,
    mode: state.shiftMode,
    start: state.shiftMode === "clock" ? document.querySelector("#shift-start").value : "",
    end: state.shiftMode === "clock" ? document.querySelector("#shift-end").value : "",
    dayType: preview.dayType,
    breakMins: preview.brk,
    workedHours: preview.worked,
    paidHours: preview.paidHours,
    ordinaryHours: preview.ordinary,
    timeAndHalfHours: preview.timeAndHalf,
    doubleHours: preview.double,
    rate: preview.rate,
    estGross: preview.estGross,
    gross: preview.estGross,
    actualGross: moneyOrNull("#shift-actual-gross"),
    actualNet: moneyOrNull("#shift-actual-net"),
    actualTax: moneyOrNull("#shift-actual-tax"),
    actualSuper: moneyOrNull("#shift-actual-super"),
    actualDeductions: moneyOrNull("#shift-actual-deductions"),
    notes: document.querySelector("#shift-notes").value.trim(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.put("shifts", record);
  els.shiftDlg.close();
  toast(`Saved ${formatHours(record.paidHours)} · est. ${AUD_EXACT.format(record.estGross)}`);
  await reload();
}

async function savePayslip(event) {
  event.preventDefault();
  const id = document.querySelector("#slip-id").value || db.uid();
  const existing = state.payslips.find((p) => p.id === id);
  let fileId = existing?.fileId || null;
  let fileName = existing?.fileName || "";
  if (state.pendingFile) {
    if (existing?.fileId) await db.del("files", existing.fileId);
    fileId = await db.saveFile(state.pendingFile);
    fileName = state.pendingFile.name;
  }
  const net = moneyOrNull("#slip-net");
  if (net == null) {
    toast("Actual net / take-home is required on a payslip.");
    document.querySelector("#slip-net").focus();
    return;
  }
  const record = {
    id,
    jobId: document.querySelector("#slip-job").value,
    payDate: document.querySelector("#slip-paydate").value,
    periodStart: document.querySelector("#slip-start").value,
    periodEnd: document.querySelector("#slip-end").value,
    gross: moneyOrNull("#slip-gross") || 0,
    tax: moneyOrNull("#slip-tax") || 0,
    net,
    super: moneyOrNull("#slip-super") || 0,
    deductions: moneyOrNull("#slip-deductions") || 0,
    notes: document.querySelector("#slip-notes").value.trim(),
    fileId,
    fileName,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.put("payslips", record);
  els.slipDlg.close();
  toast(fileId ? "Payslip saved with file" : "Payslip saved");
  await reload();
}

async function saveJob(event) {
  event.preventDefault();
  const id = document.querySelector("#job-id").value || db.uid();
  const existing = state.jobs.find((j) => j.id === id);
  const record = {
    id,
    name: document.querySelector("#job-name").value.trim() || "Job",
    rate: Number(document.querySelector("#job-rate").value) || 0,
    breakMins: Number(document.querySelector("#job-break").value) || 0,
    color: document.querySelector("#job-color").value || "#3dd68c",
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  await db.put("jobs", record);
  els.jobDlg.close();
  toast(`Saved ${record.name}`);
  await reload();
}

async function saveDebt(event) {
  event.preventDefault();
  const id = document.querySelector("#debt-id").value;
  const debt = state.plan.debts.find((d) => d.id === id);
  const val = parseFloat(document.querySelector("#debt-balance").value);
  if (!debt || Number.isNaN(val) || val < 0) {
    toast("Enter a valid amount");
    return;
  }
  debt.balance = Math.round(val * 100) / 100;
  persistPlan();
  els.debtDlg.close();
  toast("Balance updated");
  render();
}

async function deleteShift() {
  const id = document.querySelector("#shift-id").value;
  if (!id) return;
  if (!(await confirmDelete("Delete this shift?", "The hours and gross come off the ledger. This cannot be undone."))) return;
  await db.del("shifts", id);
  els.shiftDlg.close();
  toast("Shift deleted");
  await reload();
}

async function deletePayslip() {
  const id = document.querySelector("#slip-id").value;
  const existing = state.payslips.find((p) => p.id === id);
  if (!id) return;
  if (!(await confirmDelete("Delete this payslip?", "The stored file is removed from this browser too."))) return;
  if (existing?.fileId) await db.del("files", existing.fileId);
  await db.del("payslips", id);
  els.slipDlg.close();
  toast("Payslip deleted");
  await reload();
}

async function deleteJob() {
  const id = document.querySelector("#job-id").value;
  if (!id) return;
  const used = state.shifts.some((s) => s.jobId === id) || state.payslips.some((p) => p.jobId === id);
  if (used) {
    toast("Move or delete this job’s shifts and payslips first.");
    return;
  }
  if (state.jobs.length === 1) {
    toast("Keep at least one job.");
    return;
  }
  if (!(await confirmDelete("Delete this job?", "Rates for this employer will be removed."))) return;
  await db.del("jobs", id);
  els.jobDlg.close();
  toast("Job deleted");
  await reload();
}

async function openViewer(slip) {
  if (!slip?.fileId) {
    openPayslip(slip);
    return;
  }
  const file = await db.get("files", slip.fileId);
  if (!file) {
    toast("The file is missing from this browser.");
    openPayslip(slip);
    return;
  }
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file.blob);
  document.querySelector("#viewer-title").textContent = file.name;
  const link = document.querySelector("#viewer-download");
  link.href = objectUrl;
  link.download = file.name;
  const body = document.querySelector("#viewer-body");
  if (file.type.startsWith("image/")) {
    body.innerHTML = `<img class="viewer-img" alt="${escapeHtml(file.name)}" src="${objectUrl}" />`;
  } else {
    body.innerHTML = `<iframe class="viewer-frame" title="${escapeHtml(file.name)}" src="${objectUrl}"></iframe>`;
  }
  els.viewerDlg.showModal();
}

function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportJson() {
  const payload = await db.exportBackup();
  payload.plan = state.plan;
  downloadBlob(`green-ledger-${todayISO()}.json`, new Blob([JSON.stringify(payload)], { type: "application/json" }));
  toast("Backup downloaded");
}

function exportCsv() {
  const csv = db.shiftsToCsv(state.shifts, state.jobs);
  downloadBlob(`green-ledger-hours-${todayISO()}.csv`, new Blob([csv], { type: "text/csv" }));
  toast("Hours CSV downloaded");
}

async function importJson(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    toast("That JSON could not be read.");
    return;
  }
  if (!(await confirmDelete("Replace this ledger?", "Import overwrites jobs, hours, payslips, and files in this browser.", "Replace"))) {
    return;
  }
  await db.importBackup(payload);
  if (payload.plan) {
    state.plan = { ...state.plan, ...payload.plan, debts: payload.plan.debts || state.plan.debts };
    persistPlan();
  }
  toast("Backup imported");
  await reload();
}

function closeDialogs(from) {
  if (from?.id === "dlg-viewer" && objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = "";
    document.querySelector("#viewer-body").innerHTML = "";
  }
}

function onJobChange() {
  const job = jobById(document.querySelector("#shift-job").value);
  if (!job) return;
  document.querySelector("#shift-rate").value = job.rate;
  document.querySelector("#shift-break").value = job.breakMins;
  updateShiftPreview();
}

document.addEventListener("click", (event) => {
  const viewBtn = event.target.closest("[data-view]");
  if (viewBtn) {
    setView(viewBtn.dataset.view);
    return;
  }
  const bandBtn = event.target.closest("[data-band]");
  if (bandBtn) {
    state.plan.band = bandBtn.dataset.band;
    persistPlan();
    render();
    toast(`Planning band: ${bandById(state.plan.band).name}`);
    return;
  }
  if (event.target.closest("[data-open='shift']")) {
    openShift(null);
    return;
  }
  if (event.target.closest("[data-open='payslip']")) {
    openPayslip(null);
    return;
  }
  if (event.target.closest("[data-open='job']")) {
    openJob(null);
    return;
  }
  if (event.target.closest("[data-close]")) {
    event.target.closest("dialog")?.close();
    return;
  }
  const shiftId = event.target.closest("[data-edit-shift]")?.dataset.editShift;
  if (shiftId) {
    openShift(state.shifts.find((s) => s.id === shiftId));
    return;
  }
  const slipId = event.target.closest("[data-edit-slip]")?.dataset.editSlip;
  if (slipId) {
    const slip = state.payslips.find((p) => p.id === slipId);
    if (event.target.closest("#view-dashboard") && slip?.fileId) openViewer(slip);
    else openPayslip(slip);
    return;
  }
  const jobId = event.target.closest("[data-edit-job]")?.dataset.editJob;
  if (jobId) {
    openJob(state.jobs.find((j) => j.id === jobId));
    return;
  }
  const mode = event.target.closest("[data-mode]")?.dataset.mode;
  if (mode) {
    setShiftMode(mode);
    return;
  }
  const dayType = event.target.closest("[data-day-type]")?.dataset.dayType;
  if (dayType) setDayType(dayType);

  const debtBtn = event.target.closest("button[data-action]");
  if (debtBtn) {
    const debt = state.plan.debts.find((d) => d.id === debtBtn.dataset.id);
    if (!debt) return;
    if (debtBtn.dataset.action === "edit") openDebt(debt);
    if (debtBtn.dataset.action === "clear") {
      debt.balance = 0;
      persistPlan();
      render();
      toast(`${debt.name} marked cleared`);
    }
    if (debtBtn.dataset.action === "restore") {
      debt.balance = debt.original;
      persistPlan();
      render();
      toast(`${debt.name} restored`);
    }
    return;
  }

  const billBtn = event.target.closest("button[data-bill]");
  if (billBtn) {
    const id = billBtn.dataset.bill;
    state.plan.paidBills[id] = !state.plan.paidBills[id];
    persistPlan();
    render();
    toast(state.plan.paidBills[id] ? "Marked paid" : "Payment undone");
    return;
  }

  const check = event.target.closest("[data-check]");
  if (check) {
    const i = Number(check.dataset.check);
    state.plan.checks[i] = !state.plan.checks[i];
    persistPlan();
    renderRitual();
    return;
  }

  if (event.target.id === "btn-clear-checks") {
    state.plan.checks = CHECKLIST.map(() => false);
    persistPlan();
    renderRitual();
    toast("Checklist cleared");
    return;
  }

  if (event.target.id === "btn-save-week") {
    const status = document.querySelector("#week-status")?.value;
    const note = document.querySelector("#week-note")?.value.trim() || "";
    if (!status) {
      toast("Select On plan or Off plan");
      return;
    }
    state.plan.weekLogs.push({
      date: new Date().toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
      status,
      note,
    });
    persistPlan();
    renderRitual();
    toast("Week log saved");
  }
});

document.addEventListener("change", (event) => {
  const filter = event.target.dataset.filter;
  if (filter === "job") {
    state.jobFilter = event.target.value;
    render();
  }
  if (filter === "month") {
    state.monthFilter = event.target.value;
    render();
  }
  if (event.target.id === "shift-job") onJobChange();
  if (event.target.id === "shift-date") {
    setDayType(suggestDayType(event.target.value), { fromDate: true });
  }
  if (event.target.id === "slip-file" && event.target.files[0]) {
    state.pendingFile = event.target.files[0];
    els.dropLabel.textContent = state.pendingFile.name;
  }
  if (event.target.id === "import-json" && event.target.files[0]) {
    importJson(event.target.files[0]);
    event.target.value = "";
  }
});

document.addEventListener("input", (event) => {
  if (event.target.closest("#shift-form") && !event.target.id.startsWith("shift-actual")) {
    updateShiftPreview();
  }
});

document.querySelector("#shift-form").addEventListener("submit", (e) => {
  saveShift(e).catch((err) => toast(err.message));
});
document.querySelector("#payslip-form").addEventListener("submit", (e) => {
  savePayslip(e).catch((err) => toast(err.message));
});
document.querySelector("#job-form").addEventListener("submit", (e) => {
  saveJob(e).catch((err) => toast(err.message));
});
document.querySelector("#debt-form").addEventListener("submit", (e) => {
  saveDebt(e).catch((err) => toast(err.message));
});
document.querySelector("#shift-delete").addEventListener("click", () => {
  deleteShift().catch((err) => toast(err.message));
});
document.querySelector("#slip-delete").addEventListener("click", () => {
  deletePayslip().catch((err) => toast(err.message));
});
document.querySelector("#job-delete").addEventListener("click", () => {
  deleteJob().catch((err) => toast(err.message));
});
document.querySelector("#slip-view").addEventListener("click", () => {
  const id = document.querySelector("#slip-id").value;
  const slip = state.payslips.find((p) => p.id === id);
  if (slip?.fileId) {
    els.slipDlg.close();
    openViewer(slip).catch((err) => toast(err.message));
  }
});

document.addEventListener("click", (event) => {
  if (event.target.id === "export-json") exportJson().catch((err) => toast(err.message));
  if (event.target.id === "export-csv") exportCsv();
});

["dragenter", "dragover"].forEach((name) => {
  els.drop.addEventListener(name, (e) => {
    e.preventDefault();
    els.drop.classList.add("over");
  });
});
["dragleave", "drop"].forEach((name) => {
  els.drop.addEventListener(name, (e) => {
    e.preventDefault();
    els.drop.classList.remove("over");
  });
});
els.drop.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (!file) return;
  state.pendingFile = file;
  els.dropLabel.textContent = file.name;
});

els.viewerDlg.addEventListener("close", () => closeDialogs(els.viewerDlg));

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.view === "dashboard") renderDashboard();
  }, 150);
});

window.addEventListener("hashchange", () => {
  const view = location.hash.replace("#/", "") || "dashboard";
  if (VIEWS.includes(view)) {
    state.view = view;
    render();
  }
});

const initial = location.hash.replace("#/", "");
if (VIEWS.includes(initial)) state.view = initial;

reload().catch((err) => {
  console.error(err);
  toast("Could not open local storage. Try a normal Chrome/Edge window, not file://.");
});
