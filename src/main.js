// 成就本 — UI layer.

import {
  toDateStr,
  addDays,
  entriesFor,
  dailySeries,
  filterRange,
  personalBest,
  cumulativeTotal,
  streakDays,
  latestAndPrevious,
  vsLastMonth,
  bestInPeriod,
  attemptsOnDay,
  weeklySummary,
  milestones,
  isNewPB,
  formatValue,
} from './metrics.js';
import { PRESET_EXERCISES, getMetric } from './presets.js';
import { t } from './i18n.js';
import {
  getExercises,
  getEntries,
  addEntry,
  deleteEntry,
  clearEntries,
  bulkAddEntries,
  getSetting,
  setSetting,
} from './db.js';
import { renderCurve, renderSparkline } from './chart.js';
import { celebrate } from './celebrate.js';
import { makeDemoEntries } from './seed.js';

/* ------------------------------------------------------------------ */
/* local strings                                                       */
/* ------------------------------------------------------------------ */

const LOCAL = {
  zh: {
    sameAsLast: '和上次一样',
    faster: '快了 ',
    dec: '减少',
    inc: '增加',
    prevEx: '上一个运动',
    nextEx: '下一个运动',
    chartMetric: '图表指标',
    timeRange: '时间范围',
    goTo: '查看{n}',
    noRecords: '还没有记录',
    deleteConfirm: '确定删除这条记录吗？',
    clearConfirm: '确定要清空所有记录吗？',
    settingsTitle: '设置',
    mainNav: '主导航',
    previewHint: '点一下就能预览',
  },
  en: {
    sameAsLast: 'Same as last time',
    faster: 'faster by ',
    dec: 'decrease',
    inc: 'increase',
    prevEx: 'Previous sport',
    nextEx: 'Next sport',
    chartMetric: 'Chart metric',
    timeRange: 'Time range',
    goTo: 'Show {n}',
    noRecords: 'No records yet',
    deleteConfirm: 'Delete this record?',
    clearConfirm: 'Clear all records?',
    settingsTitle: 'Settings',
    mainNav: 'Main navigation',
    previewHint: 'Tap an option to preview',
  },
};

function L(key, params) {
  const table = LOCAL[state.lang] || LOCAL.zh;
  let str = table[key];
  if (str === undefined) str = LOCAL.zh[key];
  if (str === undefined) return String(key);
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(params, name) && params[name] !== undefined && params[name] !== null
      ? String(params[name])
      : m
  );
}

function T(key, params) {
  return t(key, state.lang, params);
}

/* ------------------------------------------------------------------ */
/* state                                                               */
/* ------------------------------------------------------------------ */

const state = {
  exercises: [],
  entries: [],
  view: 'home',
  detailId: null,
  chartMetric: {},
  homeIndex: 0,
  range: '30d',
  lang: getSetting('lang', 'zh') === 'en' ? 'en' : 'zh',
  celebration: getSetting('celebration', 'stars'),
  highlightEntryId: null,
  animateCurve: false,
};

let recordState = null;
let sheet = null;

const IS_DEV = (() => {
  try {
    if (import.meta.env && import.meta.env.DEV) return true;
  } catch {
    /* ignore */
  }
  try {
    return new URLSearchParams(location.search).has('dev');
  } catch {
    return false;
  }
})();

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function esc(value) {
  return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, (c) => {
    if (c === '&') return '&amp;';
    if (c === '<') return '&lt;';
    if (c === '>') return '&gt;';
    if (c === '"') return '&quot;';
    return '&#39;';
  });
}

function todayStr() {
  return toDateStr(new Date());
}

function findExercise(id) {
  if (!id) return null;
  return state.exercises.find((e) => e && e.id === id) || null;
}

function currentExercise() {
  return state.exercises[state.homeIndex] || state.exercises[0] || null;
}

function exName(ex) {
  if (!ex) return '';
  return state.lang === 'en' ? ex.nameEn || ex.name : ex.name;
}

function metricLabel(metric) {
  if (!metric) return '';
  return state.lang === 'en' ? metric.labelEn || metric.label : metric.label;
}

function metricUnit(metric) {
  if (!metric) return '';
  return state.lang === 'en' ? metric.unitEn || metric.unit : metric.unit;
}

function chartMetricKey(ex) {
  if (!ex) return '';
  const allowed = Array.isArray(ex.chartMetrics) && ex.chartMetrics.length
    ? ex.chartMetrics
    : ex.defaultChartMetric
    ? [ex.defaultChartMetric]
    : [];
  const saved = state.chartMetric[ex.id];
  if (saved && allowed.includes(saved)) return saved;
  if (ex.defaultChartMetric && allowed.includes(ex.defaultChartMetric)) return ex.defaultChartMetric;
  return allowed[0] || '';
}

function fmtDate(dateStr) {
  const parts = String(dateStr || '').split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return String(dateStr || '');
  if (state.lang === 'en') {
    try {
      return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(y, m - 1, d));
    } catch {
      return `${m}/${d}`;
    }
  }
  return `${m}月${d}日`;
}

function parseNum(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(',', '.');
  if (s === '') return null;
  if (!/^\d*\.?\d*$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function highlightedDate(ex, key) {
  if (!state.highlightEntryId || !ex) return null;
  const entry = state.entries.find((e) => e && e.id === state.highlightEntryId);
  if (!entry || entry.exerciseId !== ex.id) return null;
  return entry.date;
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  window.requestAnimationFrame(() => {
    el.textContent = message;
  });
  window.setTimeout(() => el.remove(), 2500);
}

/* ------------------------------------------------------------------ */
/* boot + render                                                       */
/* ------------------------------------------------------------------ */

async function boot() {
  try {
    state.exercises = await getExercises();
  } catch {
    state.exercises = [];
  }
  if (!Array.isArray(state.exercises) || !state.exercises.length) {
    state.exercises = PRESET_EXERCISES.slice();
  }
  try {
    state.entries = await getEntries();
  } catch {
    state.entries = [];
  }
  if (!Array.isArray(state.entries)) state.entries = [];

  const savedMetrics = getSetting('chartMetric', {});
  if (savedMetrics && typeof savedMetrics === 'object' && !Array.isArray(savedMetrics)) {
    state.chartMetric = { ...savedMetrics };
  }

  document.documentElement.lang = state.lang === 'en' ? 'en' : 'zh-CN';
  wireGlobal();
  render();
}

function render() {
  const app = document.getElementById('app');
  if (!app) return;

  if (state.view === 'detail' && !findExercise(state.detailId)) state.view = 'home';
  if (state.homeIndex < 0 || state.homeIndex >= state.exercises.length) state.homeIndex = 0;

  let focusSel = null;
  const active = document.activeElement;
  if (active && active !== document.body && active.closest && active.closest('#app') && active.dataset) {
    const d = active.dataset;
    if (d.action) {
      const parts = [`[data-action="${d.action}"]`];
      if (d.key !== undefined) parts.push(`[data-key="${d.key}"]`);
      if (d.range !== undefined) parts.push(`[data-range="${d.range}"]`);
      if (d.id !== undefined) parts.push(`[data-id="${d.id}"]`);
      if (d.i !== undefined) parts.push(`[data-i="${d.i}"]`);
      if (d.tab !== undefined) parts.push(`[data-tab="${d.tab}"]`);
      focusSel = parts.join('');
    }
  }

  let html = '';
  if (state.view === 'detail') html = detailHtml();
  else if (state.view === 'achievements') html = achievementsHtml();
  else html = homeHtml();

  app.innerHTML = html + tabbarHtml();
  state.animateCurve = false;

  if (focusSel) {
    const el = app.querySelector(focusSel);
    if (el && typeof el.focus === 'function') el.focus({ preventScroll: true });
  }
}

/* ------------------------------------------------------------------ */
/* home                                                                */
/* ------------------------------------------------------------------ */

function homeHtml() {
  const today = todayStr();
  const week = weeklySummary(state.exercises, state.entries, today);

  const weekHtml = week
    .map((w) => {
      const ex = findExercise(w.exerciseId);
      if (!ex) return '';
      const isCount = !ex.weekly || ex.weekly.mode === 'count' || !ex.weekly.metric;
      let numText;
      let unitText;
      if (isCount) {
        numText = String(w.value);
        unitText = T('attemptsUnit');
      } else {
        const m = getMetric(ex, ex.weekly.metric);
        numText = m ? formatValue(m, w.value) : String(w.value);
        unitText = m ? metricUnit(m) : '';
      }
      return `<div class="week-item">
        <span class="big n-week">${esc(numText)}</span>
        <span class="label week-label">${esc(unitText)} <span aria-hidden="true">${esc(ex.icon || '')}</span></span>
      </div>`;
    })
    .join('');

  const emptyHtml =
    state.entries.length === 0
      ? `<div class="empty">
          <p class="label">${esc(T('noData'))}</p>
          <p class="empty-hint" aria-hidden="true">＋</p>
        </div>`
      : '';

  return `<div class="screen">
    <header class="topbar">
      <h1 class="screen-title">${esc(T('tabSports'))}</h1>
      <button type="button" class="icon-btn" data-action="open-settings" aria-label="${esc(T('settings'))}">⚙︎</button>
    </header>

    <h2 class="label section-label">${esc(T('thisWeek'))}</h2>
    <div class="week-grid">${weekHtml}</div>

    ${curveCardHtml()}

    ${emptyHtml}
    <div class="ex-list">${exerciseListHtml()}</div>

    <button type="button" class="fab" data-action="open-record" aria-label="${esc(T('addRecord'))}">＋</button>
  </div>`;
}

function curveCardHtml() {
  const today = todayStr();
  const ex = currentExercise();
  if (!ex) return '';

  const key = chartMetricKey(ex);
  const metric = getMetric(ex, key);
  const unit = metricUnit(metric);
  const series = filterRange(dailySeries(ex, state.entries, key), '30d', today);
  const pb = personalBest(ex, state.entries, key);
  const lp = latestAndPrevious(ex, state.entries, key);
  const latest = lp.latest;

  const aria = T('chartAria', {
    name: `${exName(ex)} ${metric ? metricLabel(metric) : ''}`.trim(),
    latest: latest ? `${formatValue(metric, latest.value)} ${unit}`.trim() : '–',
    pb: pb ? `${formatValue(metric, pb.value)} ${unit}`.trim() : '–',
  });

  const svg = renderCurve({
    series,
    metricLabel: metric ? metricLabel(metric) : '',
    unit,
    range: '30d',
    today,
    height: 200,
    pbDate: pb ? pb.date : null,
    highlightDate: highlightedDate(ex, key),
    animate: false,
    ariaLabel: aria,
    formatValue: (v) => formatValue(metric, v),
    lowerIsBetter: metric ? metric.higherIsBetter === false : false,
    emptyText: L('noRecords'),
  });

  const monthly = vsLastMonth(ex, state.entries, key, today);
  let vsHtml = '';
  if (monthly.direction === 'up' && typeof monthly.pct === 'number' && monthly.pct > 0) {
    vsHtml = `<p class="delta-up"><span aria-hidden="true">▲</span> ${esc(T('vsLastMonth'))} +${esc(
      monthly.pct
    )}%</p>`;
  } else {
    let best = bestInPeriod(ex, state.entries, key, addDays(today, -29), today);
    let label = T('bestThisMonth');
    if (best === null) {
      label = T('bestRecent');
      best = latest ? latest.value : null;
    }
    if (best !== null && best !== undefined) {
      vsHtml = `<p class="label monthly-line">${esc(label)} <span class="big n-mid">${esc(
        formatValue(metric, best)
      )}</span> ${esc(unit)}</p>`;
    }
  }

  const dots = state.exercises
    .map(
      (e, i) =>
        `<button type="button" class="dot" data-action="curve-dot" data-i="${i}" aria-current="${
          i === state.homeIndex ? 'true' : 'false'
        }" aria-label="${esc(L('goTo', { n: exName(e) }))}"><span class="dot-in"></span></button>`
    )
    .join('');

  return `<section class="card" data-swipe="curve">
    <div class="curve-head">
      <h2 class="curve-title">
        <span class="ex-icon" aria-hidden="true">${esc(ex.icon || '')}</span>
        <span>${esc(exName(ex))}</span>
        <span class="curve-metric">· ${esc(metric ? metricLabel(metric) : '')} ${esc(unit)}</span>
      </h2>
      <div class="curve-nav">
        <button type="button" class="nav-btn" data-action="curve-prev" aria-label="${esc(L('prevEx'))}">‹</button>
        <button type="button" class="nav-btn" data-action="curve-next" aria-label="${esc(L('nextEx'))}">›</button>
      </div>
    </div>
    <div class="curve-box">${svg}</div>
    ${vsHtml}
    ${milestoneHtml(ex, key)}
    <div class="dots">${dots}</div>
  </section>`;
}

function milestoneHtml(ex, key) {
  if (!ex || !key || key === 'pace') return '';
  const metric = getMetric(ex, key);
  if (metric && metric.derived) return '';
  const unit = metricUnit(metric);
  const total = cumulativeTotal(ex, state.entries, key);
  if (typeof total !== 'number') return '';
  const ms = milestones(total, [100, 500, 1000]);
  const parts = [];
  if (ms.reached.length) {
    const largest = ms.reached[ms.reached.length - 1];
    parts.push(T('milestone', { n: `${formatValue(metric, largest)} ${unit}`.trim() }));
  }
  if (ms.next !== null) {
    parts.push(T('nextMilestone', { n: `${formatValue(metric, ms.next)} ${unit}`.trim() }));
  }
  if (!parts.length) return '';
  return `<p class="label milestone-line">${esc(parts.join(' · '))}</p>`;
}

function exerciseListHtml() {
  const today = todayStr();
  return state.exercises
    .map((ex) => {
      const key = chartMetricKey(ex);
      const metric = getMetric(ex, key);
      const unit = metricUnit(metric);
      const latest = latestAndPrevious(ex, state.entries, key).latest;
      const sparkValues = dailySeries(ex, state.entries, key)
        .slice(-10)
        .map((p) => p.value);
      const tries = attemptsOnDay(state.entries, ex.id, today);

      return `<button type="button" class="row" data-action="open-exercise" data-id="${esc(ex.id)}">
        <span class="row-icon" aria-hidden="true">${esc(ex.icon || '')}</span>
        <span class="row-main">
          <span class="row-name">${esc(exName(ex))}</span>
          ${
            tries > 0
              ? `<span class="row-sub"><span aria-hidden="true">💪</span> ${esc(
                  T('triesToday', { n: tries })
                )}</span>`
              : ''
          }
        </span>
        <span class="row-right">
          <span class="row-val">
            <span class="big n-mid">${esc(latest ? formatValue(metric, latest.value) : '–')}</span>
            <span class="label row-unit">${esc(unit)}</span>
          </span>
          <span class="row-spark" aria-hidden="true">${renderSparkline(sparkValues)}</span>
        </span>
        <span class="chev" aria-hidden="true">›</span>
      </button>`;
    })
    .join('');
}

/* ------------------------------------------------------------------ */
/* detail                                                              */
/* ------------------------------------------------------------------ */

function detailHtml() {
  const ex = findExercise(state.detailId) || currentExercise();
  if (!ex) return '<div class="screen"></div>';

  const today = todayStr();
  const key = chartMetricKey(ex);
  const metric = getMetric(ex, key);
  const unit = metricUnit(metric);
  const lp = latestAndPrevious(ex, state.entries, key);
  const latest = lp.latest;
  const pb = personalBest(ex, state.entries, key);
  const total = cumulativeTotal(ex, state.entries, key);
  const streak = streakDays(entriesFor(state.entries, ex.id), today);
  const tries = attemptsOnDay(state.entries, ex.id, today);
  const series = filterRange(dailySeries(ex, state.entries, key), state.range, today);

  const aria = T('chartAria', {
    name: `${exName(ex)} ${metric ? metricLabel(metric) : ''}`.trim(),
    latest: latest ? `${formatValue(metric, latest.value)} ${unit}`.trim() : '–',
    pb: pb ? `${formatValue(metric, pb.value)} ${unit}`.trim() : '–',
  });

  const svg = renderCurve({
    series,
    metricLabel: metric ? metricLabel(metric) : '',
    unit,
    range: state.range,
    today,
    height: 260,
    pbDate: pb ? pb.date : null,
    highlightDate: highlightedDate(ex, key),
    animate: state.animateCurve,
    ariaLabel: aria,
    formatValue: (v) => formatValue(metric, v),
    lowerIsBetter: metric ? metric.higherIsBetter === false : false,
    emptyText: L('noRecords'),
  });

  const metricSwitch =
    Array.isArray(ex.chartMetrics) && ex.chartMetrics.length > 1
      ? `<div class="segmented" role="radiogroup" aria-label="${esc(L('chartMetric'))}">
          ${ex.chartMetrics
            .map((k) => {
              const m = getMetric(ex, k);
              return `<button type="button" class="seg" role="radio" aria-checked="${k === key}" data-action="metric" data-key="${esc(
                k
              )}">${esc(metricLabel(m))}</button>`;
            })
            .join('')}
        </div>`
      : '';

  const ranges = [
    ['7d', T('range7')],
    ['30d', T('range30')],
    ['all', T('rangeAll')],
  ];
  const rangeSwitch = `<div class="segmented" role="radiogroup" aria-label="${esc(L('timeRange'))}">
    ${ranges
      .map(
        ([value, label]) =>
          `<button type="button" class="seg" role="radio" aria-checked="${
            state.range === value
          }" data-action="range" data-range="${esc(value)}">${esc(label)}</button>`
      )
      .join('')}
  </div>`;

  let vsHtml = '';
  const hib = metric ? metric.higherIsBetter !== false : true;
  if (typeof lp.diff === 'number' && lp.diff !== 0) {
    const better = hib ? lp.diff > 0 : lp.diff < 0;
    if (better) {
      vsHtml = `<p class="delta-up"><span aria-hidden="true">▲</span> ${esc(T('vsLast'))} ${hib ? '+' : esc(L('faster'))}${esc(
        formatValue(metric, Math.abs(lp.diff))
      )}</p>`;
    } else if (pb && typeof pb.value === 'number') {
      vsHtml = `<p class="label same">${esc(T('personalBest'))} <span class="big n-mid">${esc(
        formatValue(metric, pb.value)
      )}</span> ${esc(unit)}</p>`;
    }
  } else if (lp.diff === 0) {
    vsHtml = `<p class="label same">${esc(L('sameAsLast'))} =</p>`;
  }

  const stats = [
    `<div class="stat"><span class="stat-label">${esc(T('personalBest'))}</span><span class="stat-val"><span class="big n-mid">${esc(
      pb ? formatValue(metric, pb.value) : '–'
    )}</span><span class="label">${esc(unit)}</span></span></div>`,
  ];
  if (key !== 'pace' && typeof total === 'number') {
    stats.push(
      `<div class="stat"><span class="stat-label">${esc(T('cumulative'))}</span><span class="stat-val"><span class="big n-mid">${esc(
        formatValue(metric, total)
      )}</span><span class="label">${esc(unit)}</span></span></div>`
    );
  }
  stats.push(
    `<div class="stat"><span class="stat-label">${esc(T('streak'))}</span><span class="stat-val"><span class="big n-mid">${esc(
      streak
    )}</span><span class="label">${esc(T('days'))}</span></span></div>`
  );

  const records = entriesFor(state.entries, ex.id).slice().reverse();
  const recordsHtml = records.length
    ? `<details class="records">
        <summary>${esc(T('record'))} (${records.length})</summary>
        <ul>
          ${records
            .map((entry) => {
              const vals = ex.metrics
                .filter((m) => m.input)
                .map((m) => {
                  const raw = entry.values ? entry.values[m.key] : undefined;
                  if (raw === undefined || raw === null || raw === '') return '';
                  return `<span class="rec-val"><span class="big n-mid">${esc(
                    formatValue(m, raw)
                  )}</span><span class="label">${esc(metricUnit(m))}</span></span>`;
                })
                .filter(Boolean)
                .join('');
              return `<li class="rec">
                <span class="rec-date label">${esc(fmtDate(entry.date))}</span>
                <span class="rec-vals">${vals}</span>
                <button type="button" class="rec-del" data-action="delete-entry" data-id="${esc(
                  entry.id
                )}" aria-label="${esc(T('delete'))}">🗑</button>
              </li>`;
            })
            .join('')}
        </ul>
      </details>`
    : '';

  return `<div class="screen">
    <header class="topbar">
      <button type="button" class="back-btn" data-action="back">‹ ${esc(T('back'))}</button>
    </header>

    <div class="detail-head">
      <span class="ex-icon ex-icon-lg" aria-hidden="true">${esc(ex.icon || '')}</span>
      <h1 class="detail-name">${esc(exName(ex))}</h1>
    </div>

    ${metricSwitch}

    <div class="detail-hero">
      <span class="big n-hero">${esc(latest ? formatValue(metric, latest.value) : '–')}</span>
      <span class="hero-unit">${esc(unit)}</span>
    </div>
    ${
      tries > 0
        ? `<p class="label"><span aria-hidden="true">💪</span> ${esc(T('triesToday', { n: tries }))}</p>`
        : ''
    }
    ${vsHtml}

    ${rangeSwitch}

    <div class="curve-box">${svg}</div>

    <div class="stats">${stats.join('')}</div>
    ${milestoneHtml(ex, key)}
    ${recordsHtml}

    <button type="button" class="fab" data-action="open-record" aria-label="${esc(T('addRecord'))}">＋</button>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* achievements                                                        */
/* ------------------------------------------------------------------ */

function achievementsHtml() {
  return `<div class="screen">
    <header class="topbar">
      <h1 class="screen-title">${esc(T('tabAchievements'))}</h1>
      <button type="button" class="icon-btn" data-action="open-settings" aria-label="${esc(T('settings'))}">⚙︎</button>
    </header>
    <div class="ach">
      <div class="ach-icon" aria-hidden="true">🏆</div>
      <p class="label">${esc(T('achievementsSoon'))}</p>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* tab bar                                                             */
/* ------------------------------------------------------------------ */

function tabbarHtml() {
  const isAch = state.view === 'achievements';
  return `<nav class="tabbar" role="tablist" aria-label="${esc(L('mainNav'))}">
    <button type="button" class="tab" role="tab" aria-selected="${!isAch}" data-action="tab" data-tab="home">
      <span class="tab-icon" aria-hidden="true">🏃</span>
      <span class="tab-text">${esc(T('tabSports'))}</span>
    </button>
    <button type="button" class="tab" role="tab" aria-selected="${isAch}" data-action="tab" data-tab="achievements">
      <span class="tab-icon" aria-hidden="true">🏆</span>
      <span class="tab-text">${esc(T('tabAchievements'))}</span>
    </button>
  </nav>`;
}

/* ------------------------------------------------------------------ */
/* navigation + actions                                                */
/* ------------------------------------------------------------------ */

function stepExercise(delta) {
  const n = state.exercises.length;
  if (!n) return;
  state.homeIndex = (state.homeIndex + delta + n) % n;
  render();
}

function openDetail(id) {
  if (!id) return;
  state.detailId = id;
  state.view = 'detail';
  state.animateCurve = false;
  render();
  try {
    window.scrollTo(0, 0);
  } catch {
    /* ignore */
  }
}

function setChartMetric(exerciseId, key) {
  if (!exerciseId || !key) return;
  state.chartMetric = { ...state.chartMetric, [exerciseId]: key };
  setSetting('chartMetric', state.chartMetric);
  state.animateCurve = true;
  render();
}

async function removeEntry(id) {
  if (!id) return;
  if (!window.confirm(L('deleteConfirm'))) return;
  try {
    await deleteEntry(id);
  } catch {
    /* ignore */
  }
  state.entries = state.entries.filter((e) => e && e.id !== id);
  render();
}

function onAppClick(event) {
  const target = event.target;
  if (!target || !target.closest) return;
  const el = target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  if (action === 'open-settings') {
    openSettings();
  } else if (action === 'tab') {
    const tab = el.dataset.tab === 'achievements' ? 'achievements' : 'home';
    if (state.view !== tab) {
      state.view = tab;
      render();
      try {
        window.scrollTo(0, 0);
      } catch {
        /* ignore */
      }
    }
  } else if (action === 'curve-prev') {
    stepExercise(-1);
  } else if (action === 'curve-next') {
    stepExercise(1);
  } else if (action === 'curve-dot') {
    const i = Number(el.dataset.i);
    if (Number.isFinite(i)) {
      state.homeIndex = i;
      render();
    }
  } else if (action === 'open-exercise') {
    openDetail(el.dataset.id);
  } else if (action === 'back') {
    state.view = 'home';
    render();
  } else if (action === 'open-record') {
    const preselect = state.view === 'detail' ? state.detailId : currentExercise() ? currentExercise().id : null;
    openRecordSheet(preselect);
  } else if (action === 'range') {
    const range = el.dataset.range;
    if (range && range !== state.range) {
      state.range = range;
      state.animateCurve = true;
      render();
    }
  } else if (action === 'metric') {
    setChartMetric(state.detailId, el.dataset.key);
  } else if (action === 'delete-entry') {
    removeEntry(el.dataset.id);
  }
}

function wireGlobal() {
  const app = document.getElementById('app');
  if (app) {
    app.addEventListener('click', onAppClick);

    let swipeStart = null;
    app.addEventListener('pointerdown', (event) => {
      const card = event.target && event.target.closest ? event.target.closest('[data-swipe]') : null;
      if (!card) {
        swipeStart = null;
        return;
      }
      swipeStart = { x: event.clientX, y: event.clientY };
    });
    app.addEventListener('pointerup', (event) => {
      if (!swipeStart) return;
      const dx = event.clientX - swipeStart.x;
      const dy = event.clientY - swipeStart.y;
      swipeStart = null;
      if (Math.abs(dx) < 40) return;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      stepExercise(dx < 0 ? 1 : -1);
    });
    app.addEventListener('pointercancel', () => {
      swipeStart = null;
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sheet) {
      event.preventDefault();
      closeSheet();
    }
  });
}

/* ------------------------------------------------------------------ */
/* sheet component                                                     */
/* ------------------------------------------------------------------ */

function focusFirst(body) {
  if (!body) return;
  const first = body.querySelector('input:not([disabled]), button:not([disabled]), select, textarea');
  if (first && typeof first.focus === 'function') {
    try {
      first.focus({ preventScroll: true });
    } catch {
      first.focus();
    }
  }
}

function closeSheet() {
  if (sheet && sheet.wrap && sheet.wrap.parentNode) sheet.wrap.remove();
  sheet = null;
  document.body.classList.remove('sheet-open');
}

function openSheet(opts) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop" data-sheet-close="1"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1">
      <div class="sheet-head">
        <h2 class="sheet-title" id="sheet-title">${esc(opts.title || '')}</h2>
        <button type="button" class="sheet-close" data-sheet-close="1" aria-label="${esc(T('close'))}">✕</button>
      </div>
      <div class="sheet-body"></div>
    </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('sheet-open');

  const body = wrap.querySelector('.sheet-body');
  const titleEl = wrap.querySelector('.sheet-title');

  const api = {
    wrap,
    body,
    setBody(html, title, focusSelector) {
      if (title !== undefined && title !== null) titleEl.textContent = title;
      body.innerHTML = html || '';
      if (focusSelector) {
        const el = body.querySelector(focusSelector);
        if (el && typeof el.focus === 'function') {
          el.focus({ preventScroll: true });
          return;
        }
      }
      focusFirst(body);
    },
  };

  sheet = api;

  wrap.addEventListener('click', (event) => {
    const closer = event.target && event.target.closest ? event.target.closest('[data-sheet-close]') : null;
    if (closer) closeSheet();
  });

  api.setBody(opts.bodyHtml || '');
  if (typeof opts.onMount === 'function') opts.onMount(api);
  return api;
}

/* ------------------------------------------------------------------ */
/* quick record sheet                                                  */
/* ------------------------------------------------------------------ */

function prefillValues(exerciseId) {
  const out = {};
  const ex = findExercise(exerciseId);
  if (!ex) return out;
  const list = entriesFor(state.entries, ex.id);
  const last = list.length ? list[list.length - 1] : null;
  if (!last || !last.values) return out;
  for (const m of ex.metrics) {
    if (!m.input) continue;
    const raw = last.values[m.key];
    if (raw === undefined || raw === null || raw === '') continue;
    out[m.key] = String(raw);
  }
  return out;
}

function hasAnyValue(ex) {
  if (!ex) return false;
  return ex.metrics.some((m) => {
    if (!m.input) return false;
    const n = parseNum(recordState.values[m.key]);
    return n !== null && n >= 0;
  });
}

function recordSheetHtml() {
  const ex = findExercise(recordState.selected) || state.exercises[0];
  if (!ex) return '';

  const choices = state.exercises
    .map((e) => {
      const checked = e.id === ex.id;
      return `<button type="button" class="ex-choice" role="radio" aria-checked="${checked}" data-r-ex="${esc(
        e.id
      )}">
        <span class="choice-icon" aria-hidden="true">${esc(e.icon || '')}</span>
        <span class="choice-name">${esc(exName(e))}</span>
        ${checked ? '<span class="choice-check" aria-hidden="true">✓</span>' : ''}
      </button>`;
    })
    .join('');

  const fields = ex.metrics
    .filter((m) => m.input)
    .map((m) => {
      const label = metricLabel(m);
      const unit = metricUnit(m);
      const raw = recordState.values[m.key];
      const value = raw === undefined || raw === null ? '' : String(raw);
      return `<div class="field">
        <div class="field-head">
          <span class="label">${esc(label)}</span>
          <span class="label field-unit">${esc(unit)}</span>
        </div>
        <div class="field-row">
          <button type="button" class="step-btn" data-r-step="-1" data-key="${esc(m.key)}" aria-label="${esc(
            `${label} ${L('dec')}`
          )}"><svg class="step-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14" /></svg></button>
          <input class="num-input" type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" autocomplete="off" enterkeyhint="done" data-r-input="1" data-key="${esc(
            m.key
          )}" value="${esc(value)}" aria-label="${esc(`${label} (${unit})`)}" />
          <button type="button" class="step-btn" data-r-step="1" data-key="${esc(m.key)}" aria-label="${esc(
            `${label} ${L('inc')}`
          )}"><svg class="step-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M12 5v14" /></svg></button>
        </div>
      </div>`;
    })
    .join('');

  const canSave = hasAnyValue(ex);

  return `<div class="ex-choices" role="radiogroup" aria-label="${esc(T('chooseExercise'))}">${choices}</div>
    <div class="fields">${fields}</div>
    <div class="field">
      <div class="field-head"><label class="label" for="rec-date">${esc(T('date'))}</label></div>
      <input id="rec-date" class="date-input" type="date" data-r-date="1" value="${esc(
        recordState.date
      )}" max="${esc(todayStr())}" />
    </div>
    <button type="button" class="primary-btn" data-r-save="1" ${canSave ? '' : 'disabled'}>${esc(T('save'))}</button>`;
}

function syncSaveButton(api) {
  const ex = findExercise(recordState.selected);
  const btn = api.body.querySelector('[data-r-save]');
  if (btn) btn.disabled = !hasAnyValue(ex);
}

function openRecordSheet(preselectId) {
  const fallback = state.view === 'detail' && state.detailId
    ? state.detailId
    : currentExercise()
    ? currentExercise().id
    : null;
  const selected = findExercise(preselectId) ? preselectId : fallback;
  recordState = {
    selected,
    values: prefillValues(selected),
    date: todayStr(),
  };
  openSheet({
    title: T('addRecord'),
    bodyHtml: recordSheetHtml(),
    onMount: wireRecordSheet,
  });
}

function wireRecordSheet(api) {
  api.body.addEventListener('click', async (event) => {
    const target = event.target;
    if (!target || !target.closest) return;

    const choice = target.closest('[data-r-ex]');
    if (choice) {
      const id = choice.dataset.rEx;
      if (id && id !== recordState.selected) {
        recordState.selected = id;
        recordState.values = prefillValues(id);
        api.setBody(recordSheetHtml(), undefined, '.num-input');
      }
      return;
    }

    const stepBtn = target.closest('[data-r-step]');
    if (stepBtn) {
      const ex = findExercise(recordState.selected);
      const key = stepBtn.dataset.key;
      const dir = Number(stepBtn.dataset.rStep) || 0;
      const metric = getMetric(ex, key);
      const step = metric && Number.isFinite(metric.step) && metric.step > 0 ? metric.step : 1;
      const current = parseNum(recordState.values[key]);
      let next = (current === null ? 0 : current) + dir * step;
      if (!(next >= 0)) next = 0;
      const str =
        metric && metric.inputType === 'int'
          ? String(Math.round(next))
          : String(Math.round(next * 10) / 10);
      recordState.values[key] = str;
      const input = api.body.querySelector(`[data-r-input][data-key="${key}"]`);
      if (input) input.value = str;
      syncSaveButton(api);
      return;
    }

    if (target.closest('[data-r-save]')) {
      await saveRecord();
    }
  });

  api.body.addEventListener('input', (event) => {
    const target = event.target;
    if (!target || !target.closest) return;
    const input = target.closest('[data-r-input]');
    if (input) {
      recordState.values[input.dataset.key] = input.value;
      syncSaveButton(api);
      return;
    }
    const dateInput = target.closest('[data-r-date]');
    if (dateInput) recordState.date = dateInput.value || todayStr();
  });

  api.body.addEventListener('change', (event) => {
    const target = event.target;
    if (!target || !target.closest) return;
    const dateInput = target.closest('[data-r-date]');
    if (dateInput) recordState.date = dateInput.value || todayStr();
  });
}

async function saveRecord() {
  const ex = findExercise(recordState.selected);
  if (!ex) return;

  const values = {};
  for (const m of ex.metrics) {
    if (!m.input) continue;
    const n = parseNum(recordState.values[m.key]);
    if (n !== null && n >= 0) values[m.key] = n;
  }
  if (!Object.keys(values).length) return;

  const date = recordState.date || todayStr();
  const draft = { exerciseId: ex.id, date, values };
  const previous = entriesFor(state.entries, ex.id);
  const hadPrevious = previous.length > 0;
  const pbKeys = hadPrevious ? isNewPB(ex, previous, draft) : [];

  let saved = null;
  try {
    saved = await addEntry(draft);
  } catch {
    saved = null;
  }
  if (!saved) return;

  state.entries = state.entries.concat(saved);
  const idx = state.exercises.findIndex((e) => e && e.id === ex.id);
  if (idx >= 0) state.homeIndex = idx;
  state.highlightEntryId = saved.id;

  closeSheet();
  render();

  if (hadPrevious && pbKeys.length) {
    celebrate(state.celebration);
    toast(T('newRecord'));
    try {
      if (navigator && typeof navigator.vibrate === 'function') navigator.vibrate([30, 40, 30]);
    } catch {
      /* ignore */
    }
  }

  const savedId = saved.id;
  window.setTimeout(() => {
    if (state.highlightEntryId === savedId) state.highlightEntryId = null;
  }, 1300);
}

/* ------------------------------------------------------------------ */
/* settings sheet                                                      */
/* ------------------------------------------------------------------ */

function settingsHtml() {
  const celebr = [
    ['stars', '⭐', T('stars')],
    ['sparkle', '✨', T('sparkle')],
    ['confetti', '🎉', T('confetti')],
  ];
  const celOptions = celebr
    .map(
      ([kind, icon, name]) => `<button type="button" class="cel-opt" role="radio" aria-checked="${
        state.celebration === kind
      }" data-cel="${kind}">
        <span class="cel-icon" aria-hidden="true">${icon}</span>
        <span class="cel-name">${esc(name)}</span>
        ${state.celebration === kind ? '<span class="choice-check" aria-hidden="true">✓</span>' : ''}
      </button>`
    )
    .join('');

  const langOptions = [
    ['zh', '中文'],
    ['en', 'English'],
  ]
    .map(
      ([lang, label]) => `<button type="button" class="cel-opt" role="radio" aria-checked="${
        state.lang === lang
      }" data-lang="${lang}">
        <span class="cel-name">${esc(label)}</span>
        ${state.lang === lang ? '<span class="choice-check" aria-hidden="true">✓</span>' : ''}
      </button>`
    )
    .join('');

  const dev = IS_DEV
    ? `<div class="sheet-section">
        <h3 class="label section-label">🛠 ${esc(T('demoData'))}</h3>
        <button type="button" class="secondary-btn" data-load-demo="1">${esc(T('loadDemo'))}</button>
        <button type="button" class="secondary-btn" data-clear-data="1">${esc(T('clearData'))}</button>
      </div>`
    : '';

  return `<div class="sheet-section">
      <h3 class="label section-label">${esc(T('celebration'))}</h3>
      <div class="cel-options" role="radiogroup" aria-label="${esc(T('celebration'))}">${celOptions}</div>
    </div>
    <div class="sheet-section">
      <h3 class="label section-label">${esc(T('language'))}</h3>
      <div class="cel-options" role="radiogroup" aria-label="${esc(T('language'))}">${langOptions}</div>
    </div>
    ${dev}`;
}

function openSettings() {
  const api = openSheet({ title: T('settings'), bodyHtml: settingsHtml() });

  api.body.addEventListener('click', async (event) => {
    const target = event.target;
    if (!target || !target.closest) return;

    const celBtn = target.closest('[data-cel]');
    if (celBtn) {
      const kind = celBtn.dataset.cel;
      if (kind) {
        state.celebration = kind;
        setSetting('celebration', kind);
        api.setBody(settingsHtml());
        celebrate(kind);
      }
      return;
    }

    const langBtn = target.closest('[data-lang]');
    if (langBtn) {
      const lang = langBtn.dataset.lang === 'en' ? 'en' : 'zh';
      if (lang !== state.lang) {
        state.lang = lang;
        setSetting('lang', lang);
        document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
        render();
        api.setBody(settingsHtml(), T('settings'));
      }
      return;
    }

    if (target.closest('[data-load-demo]')) {
      await loadDemoData();
      return;
    }

    if (target.closest('[data-clear-data]')) {
      await wipeData();
    }
  });
}

async function loadDemoData() {
  try {
    await clearEntries();
    const records = await bulkAddEntries(makeDemoEntries(todayStr()));
    state.entries = Array.isArray(records) ? records : await getEntries();
  } catch {
    /* ignore */
  }
  closeSheet();
  render();
}

async function wipeData() {
  if (!window.confirm(L('clearConfirm'))) return;
  try {
    await clearEntries();
  } catch {
    /* ignore */
  }
  state.entries = [];
  state.highlightEntryId = null;
  closeSheet();
  render();
}

/* ------------------------------------------------------------------ */
/* start                                                               */
/* ------------------------------------------------------------------ */

boot();
