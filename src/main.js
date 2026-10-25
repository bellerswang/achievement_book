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
  formatValue,
  pullupSettings,
  stageProgress,
  stageOfEntry,
  formatGrab,
  runDistances,
  runBestByDistance,
  runTimeSeries,
  runCompareLast,
  formatDuration,
  formatFaster,
  stamps,
  newStampsForSave,
  entryValue,
  distanceKey,
} from './metrics.js';
import { PRESET_EXERCISES, getMetric, LEVEL_OPTIONS } from './presets.js';
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
import { pullupLevelSvg } from './illustrations.js';

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
    mainNav: '主导航',
    previewHint: '点一下就能预览',
    best: '最佳',
    chooseStage: '选择关卡',
    judgeNote: '按下巴相对单杠的位置判断',
    currentLevel: '当前高度',
    oldRecord: '旧记录',
    noRun: '先记录一次跑步',
    chooseDistance: '选择距离',
    minutes: '分',
    seconds: '秒',
    otherDistance: '其他距离',
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
    mainNav: 'Main navigation',
    previewHint: 'Tap an option to preview',
    best: 'Best',
    chooseStage: 'Choose stage',
    judgeNote: 'Judge by chin position relative to the bar',
    currentLevel: 'Current height',
    oldRecord: 'Old record',
    noRun: 'Record a run first',
    chooseDistance: 'Choose distance',
    minutes: 'min',
    seconds: 's',
    otherDistance: 'Other',
  },
};

function L(key, params) {
  const table = LOCAL[state.lang] || LOCAL.zh;
  let str = table[key];
  if (str === undefined) str = LOCAL.zh[key];
  if (str === undefined) return String(key);
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(params, name) &&
    params[name] !== undefined &&
    params[name] !== null
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
  runDistance: {},
  homeIndex: 0,
  range: '30d',
  lang: getSetting('lang', 'zh') === 'en' ? 'en' : 'zh',
  celebration: ['stars', 'sparkle', 'confetti'].includes(getSetting('celebration', 'stars'))
    ? getSetting('celebration', 'stars')
    : 'stars',
  highlightEntryId: null,
  animateCurve: false,
  settings: {
    pullup: pullupSettings(getSetting('pullup', {})),
  },
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

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
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

function levelLabel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  let best = LEVEL_OPTIONS[0];
  for (const option of LEVEL_OPTIONS) {
    if (Math.abs(option.value - n) < Math.abs(best.value - n)) best = option;
  }
  return state.lang === 'en' ? best.labelEn : best.label;
}

function stageName(stage) {
  if (!stage) return '';
  return state.lang === 'en' ? stage.nameEn || stage.name : stage.name;
}

function stageTitle(stage) {
  if (!stage) return '';
  return `${T('stage', { n: stage.n })} ${stageName(stage)}`;
}

function parseNum(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(',', '.');
  if (s === '') return null;
  if (!/^\d*\.?\d*$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function formatInputNumber(n) {
  if (!Number.isFinite(Number(n))) return '';
  return String(Math.round(Number(n) * 100) / 100);
}

function fmtDate(dateStr) {
  const parts = String(dateStr || '').split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return String(dateStr || '');
  if (state.lang === 'en') {
    try {
      return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(
        new Date(y, m - 1, d)
      );
    } catch {
      return `${m}/${d}`;
    }
  }
  return `${m}月${d}日`;
}

function metricValueText(metric, value, withUnit = false) {
  if (value === null || value === undefined) return '–';
  const text = formatValue(metric, value);
  if (!withUnit) return text;
  const unit = metricUnit(metric);
  if (!unit) return text;
  if (unit === '%') return `${text}%`;
  return `${text} ${unit}`;
}

function chartFormatter(metric) {
  return (value) => {
    const unit = metricUnit(metric);
    const text = formatValue(metric, value);
    return unit === '%' ? `${text}%` : text;
  };
}

function chartAriaLabel(ex, metric, latestValue, pbValue, extraName = '') {
  const unit = metricUnit(metric);
  const name = `${exName(ex)}${extraName ? ` ${extraName}` : ''}${
    metric && !(extraName && extraName.includes(metricLabel(metric))) ? ` ${metricLabel(metric)}` : ''
  }`.trim();
  const latestText =
    latestValue === null || latestValue === undefined
      ? '–'
      : metricValueText(metric, latestValue, true);
  const pbText =
    pbValue === null || pbValue === undefined ? '–' : metricValueText(metric, pbValue, true);
  return T('chartAria', { name, latest: latestText, pb: pbText });
}

function highlightedDate(ex, key) {
  if (!state.highlightEntryId || !ex) return null;
  const entry = state.entries.find((e) => e && e.id === state.highlightEntryId);
  if (!entry || entry.exerciseId !== ex.id) return null;
  return entry.date;
}

function vibrate(pattern) {
  try {
    if (navigator && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
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
  window.setTimeout(() => el.remove(), 3000);
}

/* ------------------------------------------------------------------ */
/* pull-up helpers                                                     */
/* ------------------------------------------------------------------ */

function pullupProgress(ex) {
  if (!ex || ex.id !== 'pullup') return null;
  return stageProgress(ex, state.entries, state.settings.pullup);
}

function currentPullupStage(ex) {
  const progress = pullupProgress(ex);
  if (!progress) return null;
  return ex.stages.find((stage) => stage.n === progress.current) || ex.stages[0] || null;
}

// Stage to *show* on home/detail by default: the current stage once it has a
// record; right after an unlock (no record yet) keep showing the highest
// stage that has data, so May never lands on an empty chart.
function displayPullupStage(ex) {
  const progress = pullupProgress(ex);
  if (!progress) return null;
  const withData = progress.stages.filter((s) => s.unlocked && s.entries > 0).map((s) => s.n);
  const n = withData.includes(progress.current) || !withData.length ? progress.current : Math.max(...withData);
  return ex.stages.find((stage) => stage.n === n) || ex.stages[0] || null;
}

function stageEntries(ex, n) {
  return entriesFor(state.entries, ex.id).filter((entry) => stageOfEntry(entry) === n);
}

function latestEntryForStage(ex, n) {
  const list = stageEntries(ex, n);
  return list.length ? list[list.length - 1] : null;
}

function bestStageEntry(ex, n) {
  const list = stageEntries(ex, n);
  let best = null;
  let bestValue = -Infinity;

  for (const entry of list) {
    let value = null;
    if (n === 1) value = entryValue(ex, entry, 'grabRate');
    else if (n === 2) value = entryValue(ex, entry, 'hang');
    else if (n === 3) value = entryValue(ex, entry, 'level');
    if (value === null) continue;
    if (value > bestValue) {
      bestValue = value;
      best = entry;
    }
  }

  return best;
}

function stageBestText(ex, n) {
  const best = bestStageEntry(ex, n);
  if (!best) return `${L('best')} –`;

  if (n === 1) return `${L('best')} ${formatGrab(best)}`;

  if (n === 2) {
    const metric = getMetric(ex, 'hang');
    const value = entryValue(ex, best, 'hang');
    return `${L('best')} ${metricValueText(metric, value, true)}`;
  }

  if (n === 3) {
    const value = entryValue(ex, best, 'level');
    return `${L('best')} ${formatValue(getMetric(ex, 'level'), value)}%`;
  }

  return `${L('best')} –`;
}

function pullupHomeMetricKey(ex) {
  const stage = displayPullupStage(ex);
  return stage ? stage.metric : 'grabRate';
}

function pullupDetailMetricKey(ex, progress) {
  if (!progress) return 'grabRate';
  const unlocked = progress.stages.filter((s) => s.unlocked).map((s) => s.n);
  const allowed = ex.stages.filter((s) => unlocked.includes(s.n)).map((s) => s.metric);
  const saved = state.chartMetric[ex.id];
  if (saved && allowed.includes(saved)) return saved;
  const current = displayPullupStage(ex);
  return current ? current.metric : allowed[0] || 'grabRate';
}

/* ------------------------------------------------------------------ */
/* running helpers                                                     */
/* ------------------------------------------------------------------ */

function runDistanceOptions(ex) {
  const metric = getMetric(ex, 'distance');
  if (metric && Array.isArray(metric.options) && metric.options.length) return metric.options;
  return [0.5, 1, 2, 3, 5];
}

function formatDistanceText(km) {
  const metric = getMetric({ metrics: [{ key: 'distance', label: '距离', labelEn: 'Distance', unit: '公里', unitEn: 'km', inputType: 'decimal' }] }, 'distance');
  return metricValueText(metric, km, true);
}

function runSelectedDistance(ex) {
  const distances = runDistances(ex, state.entries);
  if (!distances.length) return null;

  const saved = state.runDistance[ex.id];
  if (Number.isFinite(saved) && distances.some((d) => Math.abs(d - saved) < 0.001)) {
    return saved;
  }

  const compare = runCompareLast(ex, state.entries);
  if (compare && distances.some((d) => Math.abs(d - compare.distance) < 0.001)) {
    return compare.distance;
  }

  return distances[distances.length - 1];
}

function runDetailMetricKey(ex) {
  const saved = state.chartMetric[ex.id];
  if (saved === 'distance' || saved === 'duration') return saved;
  return 'duration';
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

  state.settings.pullup = pullupSettings(getSetting('pullup', {}));

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
  if (
    active &&
    active !== document.body &&
    active.closest &&
    active.closest('#app') &&
    active.dataset
  ) {
    const d = active.dataset;
    if (d.action) {
      const parts = [`[data-action="${d.action}"]`];
      if (d.key !== undefined) parts.push(`[data-key="${d.key}"]`);
      if (d.range !== undefined) parts.push(`[data-range="${d.range}"]`);
      if (d.id !== undefined) parts.push(`[data-id="${d.id}"]`);
      if (d.i !== undefined) parts.push(`[data-i="${d.i}"]`);
      if (d.tab !== undefined) parts.push(`[data-tab="${d.tab}"]`);
      if (d.km !== undefined) parts.push(`[data-km="${d.km}"]`);
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

    ${homeCurveCardHtml()}
    ${emptyHtml}
    <div class="ex-list">${exerciseListHtml()}</div>

    <button type="button" class="fab" data-action="open-record" aria-label="${esc(T('addRecord'))}">＋</button>
  </div>`;
}

function homeCurveCardHtml() {
  const today = todayStr();
  const ex = currentExercise();
  if (!ex) return '';

  const isPullup = ex.id === 'pullup';
  const stage = isPullup ? displayPullupStage(ex) : null;
  const key = isPullup ? pullupHomeMetricKey(ex) : ex.id === 'run' ? 'distance' : 'reps';
  const metric = getMetric(ex, key) || getMetric(ex, ex.defaultChartMetric);
  const unit = metricUnit(metric);
  const series = dailySeries(ex, state.entries, key);
  const pb = personalBest(ex, state.entries, key);
  const lp = latestAndPrevious(ex, state.entries, key);
  const latest = lp.latest;

  const aria = chartAriaLabel(
    ex,
    metric,
    latest ? latest.value : null,
    pb ? pb.value : null,
    stage ? stageTitle(stage) : ''
  );

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
    valueFormatter: chartFormatter(metric),
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
        metricValueText(metric, best, false)
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

  let titleMetric = `${metric ? metricLabel(metric) : ''} ${unit}`.trim();
  if (stage) {
    titleMetric = stageTitle(stage); // e.g. 第3关 引体向上 — unit is shown on the curve itself
  }

  return `<section class="card" data-swipe="curve">
    <div class="curve-head">
      <h2 class="curve-title">
        <span class="ex-icon" aria-hidden="true">${esc(ex.icon || '')}</span>
        <span>${esc(exName(ex))}</span>
        <span class="curve-metric">${esc(titleMetric)}</span>
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
  // Cumulative milestones only make sense for additive metrics (not % levels or run times).
  if (!metric || metric.unitEn === '%' || metric.higherIsBetter === false) return '';
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
      const isPullup = ex.id === 'pullup';
      const stage = isPullup ? displayPullupStage(ex) : null;
      const key = isPullup ? stage.metric : ex.id === 'run' ? 'distance' : 'reps';
      const metric = getMetric(ex, key) || getMetric(ex, ex.defaultChartMetric);
      const unit = metricUnit(metric);

      let latestText = '–';
      let unitText = '';

      if (isPullup && stage) {
        const latestEntry = latestEntryForStage(ex, stage.n);
        if (stage.n === 1) {
          latestText = formatGrab(latestEntry);
        } else {
          const value = latestEntry ? entryValue(ex, latestEntry, key) : null;
          latestText = value !== null ? formatValue(metric, value) : '–';
          unitText = unit;
        }
      } else {
        const latest = latestAndPrevious(ex, state.entries, key).latest;
        latestText = latest ? formatValue(metric, latest.value) : '–';
        unitText = unit;
      }

      const sparkValues = dailySeries(ex, state.entries, key)
        .slice(-10)
        .map((p) => p.value);

      const tries = attemptsOnDay(state.entries, ex.id, today);

      const subParts = [];
      if (stage) subParts.push(`<span class="row-stage">${esc(stageTitle(stage))}</span>`);
      if (tries > 0) {
        subParts.push(
          `<span class="row-tries"><span aria-hidden="true">💪</span> ${esc(
            T('triesToday', { n: tries })
          )}</span>`
        );
      }

      return `<button type="button" class="row" data-action="open-exercise" data-id="${esc(ex.id)}">
        <span class="row-icon" aria-hidden="true">${esc(ex.icon || '')}</span>
        <span class="row-main">
          <span class="row-name">${esc(exName(ex))}</span>
          ${subParts.length ? `<span class="row-sub">${subParts.join(' ')}</span>` : ''}
        </span>
        <span class="row-right">
          <span class="row-val">
            <span class="big n-mid">${esc(latestText)}</span>
            <span class="label row-unit">${esc(unitText)}</span>
          </span>
          <span class="row-spark" aria-hidden="true">${renderSparkline(sparkValues, {
            lowerIsBetter: metric ? metric.higherIsBetter === false : false,
          })}</span>
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
  if (ex.id === 'pullup') return pullupDetailHtml(ex);
  if (ex.id === 'run') return runDetailHtml(ex);
  return simpleDetailHtml(ex, ex.id === 'rope' ? 'reps' : ex.defaultChartMetric);
}

function detailHeader(ex) {
  return `<header class="topbar">
      <button type="button" class="back-btn" data-action="back">‹ ${esc(T('back'))}</button>
    </header>
    <div class="detail-head">
      <span class="ex-icon ex-icon-lg" aria-hidden="true">${esc(ex.icon || '')}</span>
      <h1 class="detail-name">${esc(exName(ex))}</h1>
    </div>`;
}

function rangeSwitchHtml() {
  const ranges = [
    ['7d', T('range7')],
    ['30d', T('range30')],
    ['all', T('rangeAll')],
  ];
  return `<div class="segmented" role="radiogroup" aria-label="${esc(L('timeRange'))}">
    ${ranges
      .map(
        ([value, label]) =>
          `<button type="button" class="seg" role="radio" aria-checked="${
            state.range === value
          }" data-action="range" data-range="${esc(value)}">${esc(label)}</button>`
      )
      .join('')}
  </div>`;
}

function statHtml(label, value, unit) {
  return `<div class="stat">
    <span class="stat-label">${esc(label)}</span>
    <span class="stat-val">
      <span class="big n-mid">${esc(value)}</span>
      <span class="label">${esc(unit)}</span>
    </span>
  </div>`;
}

function statsHtml(ex, key, options = {}) {
  const metric = getMetric(ex, key);
  const unit = metricUnit(metric);
  const pb = personalBest(ex, state.entries, key);
  const total = cumulativeTotal(ex, state.entries, key);
  const streak = streakDays(entriesFor(state.entries, ex.id), todayStr());

  const parts = [
    statHtml(T('personalBest'), pb ? metricValueText(metric, pb.value, false) : '–', unit),
  ];

  if (!options.hideTotal && typeof total === 'number') {
    parts.push(statHtml(T('cumulative'), metricValueText(metric, total, false), unit));
  }

  parts.push(statHtml(T('streak'), String(streak), T('days')));
  return `<div class="stats">${parts.join('')}</div>`;
}

function improvementOrPbHtml(ex, key) {
  const metric = getMetric(ex, key);
  if (!metric) return '';

  const lp = latestAndPrevious(ex, state.entries, key);
  if (lp.latest && lp.previous && typeof lp.diff === 'number' && lp.diff > 0) {
    const unit = metricUnit(metric);
    const diffText =
      unit === '%'
        ? `${formatValue(metric, lp.diff)}%`
        : `${formatValue(metric, lp.diff)}${unit ? ` ${unit}` : ''}`;
    return `<p class="delta-up"><span aria-hidden="true">▲</span> ${esc(T('vsLast'))} +${esc(
      diffText
    )}</p>`;
  }

  const pb = personalBest(ex, state.entries, key);
  if (pb) {
    return `<p class="label monthly-line">${esc(T('personalBest'))} <span class="big n-mid">${esc(
      metricValueText(metric, pb.value, false)
    )}</span> ${esc(metricUnit(metric))}</p>`;
  }

  return '';
}

function pullupDetailHtml(ex) {
  const today = todayStr();
  const progress = pullupProgress(ex);
  if (!progress) return simpleDetailHtml(ex, 'grabRate');

  const key = pullupDetailMetricKey(ex, progress);
  const stage = ex.stages.find((s) => s.metric === key) || ex.stages[0];
  const metric = getMetric(ex, key);
  const unit = metricUnit(metric);
  const series = dailySeries(ex, state.entries, key);
  const pb = personalBest(ex, state.entries, key);
  const lp = latestAndPrevious(ex, state.entries, key);

  const aria = chartAriaLabel(
    ex,
    metric,
    lp.latest ? lp.latest.value : null,
    pb ? pb.value : null,
    stage ? stageTitle(stage) : ''
  );

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
    valueFormatter: chartFormatter(metric),
    lowerIsBetter: metric ? metric.higherIsBetter === false : false,
    emptyText: L('noRecords'),
  });

  const unlocked = progress.stages.filter((s) => s.unlocked).map((s) => s.n);
  const unlockedDefs = ex.stages.filter((s) => unlocked.includes(s.n));

  const metricSwitch =
    unlockedDefs.length > 1
      ? `<div class="segmented" role="radiogroup" aria-label="${esc(L('chartMetric'))}">
          ${unlockedDefs
            .map(
              (def) =>
                `<button type="button" class="seg" role="radio" aria-checked="${
                  def.metric === key
                }" data-action="metric" data-key="${esc(def.metric)}"><span aria-hidden="true">${esc(
                  def.icon || ''
                )}</span> ${esc(stageName(def))}</button>`
            )
            .join('')}
        </div>`
      : '';

  return `<div class="screen">
    ${detailHeader(ex)}
    ${roadHtml(ex, progress)}
    ${metricSwitch}
    ${pullupHeroHtml(ex, stage, key)}
    ${rangeSwitchHtml()}
    <div class="curve-box">${svg}</div>
    ${statsHtml(ex, key, { hideTotal: key === 'grabRate' || key === 'level' })}
    ${stickersHtml(ex)}
    ${recordsHtml(ex)}
    <button type="button" class="fab" data-action="open-record" aria-label="${esc(T('addRecord'))}">＋</button>
  </div>`;
}

function roadHtml(ex, progress) {
  const unlocked = progress.stages.filter((s) => s.unlocked);
  const highest = unlocked.reduce((max, stage) => Math.max(max, stage.n), 0);
  const items = [];

  if (highest < 3) {
    items.push(`<li class="road-node road-unknown">
      <span class="road-icon" aria-hidden="true">?</span>
      <span class="road-text">
        <span class="road-title">${esc(T('nextStageHidden'))}</span>
      </span>
    </li>`);
  }

  for (const progressStage of unlocked.slice().sort((a, b) => b.n - a.n)) {
    const def = ex.stages.find((stage) => stage.n === progressStage.n);
    if (!def) continue;
    const current = progressStage.n === progress.current;
    items.push(`<li class="road-node${current ? ' is-current' : ''}" ${
      current ? 'aria-current="step"' : ''
    }>
      <span class="road-icon" aria-hidden="true">${esc(def.icon || '')}</span>
      <span class="road-text">
        <span class="road-title">${esc(stageTitle(def))}</span>
        <span class="road-best">${esc(stageBestText(ex, def.n))}</span>
        ${current ? `<span class="road-here">📍 ${esc(T('youAreHere'))}</span>` : ''}
      </span>
    </li>`);
  }

  return `<section class="road-section">
    <h2 class="label section-label">${esc(T('road'))}</h2>
    <div class="road-wrap">
      <svg class="road-svg" viewBox="0 0 40 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d="M20 100 C20 74 20 28 20 0" fill="none" stroke="#111111" stroke-width="4" stroke-linecap="round" />
      </svg>
      <ol class="road-list" aria-label="${esc(T('road'))}">${items.join('')}</ol>
    </div>
  </section>`;
}

function pullupHeroHtml(ex, stage, key) {
  const metric = getMetric(ex, key);
  const latestEntry = stage ? latestEntryForStage(ex, stage.n) : null;
  let big = '–';
  let unitText = '';
  let sub = '';

  if (stage && stage.n === 1) {
    big = formatGrab(latestEntry);
    const rate = latestEntry ? entryValue(ex, latestEntry, 'grabRate') : null;
    sub = rate !== null ? `${T('successRate')} ${rate}%` : T('successRate');
  } else if (stage && stage.n === 2) {
    const value = latestEntry ? entryValue(ex, latestEntry, 'hang') : null;
    big = value !== null ? formatValue(metric, value) : '–';
    unitText = metricUnit(metric);
  } else if (stage && stage.n === 3) {
    const value = latestEntry ? entryValue(ex, latestEntry, 'level') : null;
    big = value !== null ? formatValue(metric, value) : '–';
    unitText = '%';
    sub = value !== null ? levelLabel(value) : '';
  }

  const tries = attemptsOnDay(state.entries, ex.id, todayStr());

  return `<div class="detail-hero">
      <span class="big n-hero">${esc(big)}</span>
      ${unitText ? `<span class="hero-unit">${esc(unitText)}</span>` : ''}
    </div>
    ${sub ? `<p class="label hero-sub">${esc(sub)}</p>` : ''}
    ${
      tries > 0
        ? `<p class="label tries-line"><span aria-hidden="true">💪</span> ${esc(
            T('triesToday', { n: tries })
          )}</p>`
        : ''
    }
    ${improvementOrPbHtml(ex, key)}`;
}

function runDetailHtml(ex) {
  const today = todayStr();
  const distances = runDistances(ex, state.entries);
  const selected = runSelectedDistance(ex);
  const metricKey = runDetailMetricKey(ex);
  const distanceMetric = getMetric(ex, 'distance');
  const timeMetric = getMetric(ex, 'duration');

  const bestMap = runBestByDistance(ex, state.entries);
  const best = selected !== null ? bestMap[distanceKey(selected)] : null;
  const timeSeries = selected !== null ? runTimeSeries(ex, state.entries, selected) : [];
  const latestTime = timeSeries.length ? timeSeries[timeSeries.length - 1].value : null;
  const compare = runCompareLast(ex, state.entries);

  let chartSeries;
  let chartMetric;
  let chartFormatterFn;
  let lowerIsBetter;
  let pbDate;
  let aria;

  if (metricKey === 'duration') {
    chartSeries = timeSeries;
    chartMetric = timeMetric;
    chartFormatterFn = (value) => formatDuration(value);
    lowerIsBetter = true;
    pbDate = best ? best.date : null;
    aria = T('chartAria', {
      name: `${exName(ex)} ${T('time')} ${selected !== null ? formatDistanceText(selected) : ''}`.trim(),
      latest: latestTime !== null ? formatDuration(latestTime) : '–',
      pb: best ? formatDuration(best.seconds) : '–',
    });
  } else {
    chartSeries = dailySeries(ex, state.entries, 'distance');
    chartMetric = distanceMetric;
    chartFormatterFn = chartFormatter(distanceMetric);
    lowerIsBetter = false;
    const pb = personalBest(ex, state.entries, 'distance');
    const lp = latestAndPrevious(ex, state.entries, 'distance');
    pbDate = pb ? pb.date : null;
    aria = chartAriaLabel(
      ex,
      distanceMetric,
      lp.latest ? lp.latest.value : null,
      pb ? pb.value : null,
      T('distance')
    );
  }

  const svg = renderCurve({
    series: chartSeries,
    metricLabel: chartMetric ? metricLabel(chartMetric) : '',
    unit: chartMetric ? metricUnit(chartMetric) : '',
    range: state.range,
    today,
    height: 260,
    pbDate,
    highlightDate: highlightedDate(ex, metricKey),
    animate: state.animateCurve,
    ariaLabel: aria,
    valueFormatter: chartFormatterFn,
    lowerIsBetter,
    emptyText: L('noRecords'),
  });

  const metricSwitch = `<div class="segmented" role="radiogroup" aria-label="${esc(L('chartMetric'))}">
    <button type="button" class="seg" role="radio" aria-checked="${
      metricKey === 'distance'
    }" data-action="metric" data-key="distance">${esc(T('distance'))}</button>
    <button type="button" class="seg" role="radio" aria-checked="${
      metricKey === 'duration'
    }" data-action="metric" data-key="duration">${esc(T('time'))}</button>
  </div>`;

  let vsHtml = '';
  if (
    compare &&
    selected !== null &&
    Math.abs(compare.distance - Number(selected)) < 0.001 &&
    compare.fasterBy
  ) {
    vsHtml = `<p class="delta-up"><span aria-hidden="true">▲</span> ${esc(
      formatFaster(compare.fasterBy, state.lang)
    )}</p>`;
  } else if (best) {
    vsHtml = `<p class="label monthly-line">${esc(T('bestForDistance'))} <span class="big n-mid">${esc(
      formatDuration(best.seconds)
    )}</span></p>`;
  }

  return `<div class="screen">
    ${detailHeader(ex)}
    ${runDistanceSelectorHtml(distances, selected)}
    ${metricSwitch}
    <div class="detail-hero">
      <span class="big n-hero">${esc(latestTime !== null ? formatDuration(latestTime) : '–')}</span>
      ${
        selected !== null
          ? `<span class="hero-unit">${esc(formatDistanceText(selected))}</span>`
          : ''
      }
    </div>
    ${vsHtml}
    ${rangeSwitchHtml()}
    <div class="curve-box">${svg}</div>
    ${runStatsHtml(ex, distances, bestMap)}
    ${stickersHtml(ex)}
    ${recordsHtml(ex)}
    <button type="button" class="fab" data-action="open-record" aria-label="${esc(T('addRecord'))}">＋</button>
  </div>`;
}

function runDistanceSelectorHtml(distances, selected) {
  if (!distances.length) return `<p class="label no-data-line">${esc(L('noRun'))}</p>`;

  return `<div class="distance-block">
    <span class="label section-label">${esc(L('chooseDistance'))}</span>
    <div class="chip-group" role="radiogroup" aria-label="${esc(L('chooseDistance'))}">
      ${distances
        .map(
          (km) =>
            `<button type="button" class="chip" role="radio" aria-checked="${
              selected !== null && Math.abs(Number(selected) - km) < 0.001
            }" data-action="run-distance" data-km="${esc(km)}">${esc(
              formatDistanceText(km)
            )}</button>`
        )
        .join('')}
    </div>
  </div>`;
}

function runStatsHtml(ex, distances, bestMap) {
  if (!distances.length) return '';

  return `<div class="stats">
    ${distances
      .map((km) => {
        const best = bestMap[distanceKey(km)];
        return `<div class="stat">
          <span class="stat-label">${esc(formatDistanceText(km))}</span>
          <span class="stat-val">
            <span class="label">${esc(T('bestForDistance'))}</span>
            <span class="big n-mid">${esc(best ? formatDuration(best.seconds) : '–')}</span>
          </span>
        </div>`;
      })
      .join('')}
  </div>`;
}

function simpleDetailHtml(ex, key) {
  const today = todayStr();
  const metric = getMetric(ex, key) || getMetric(ex, ex.defaultChartMetric);
  const unit = metricUnit(metric);
  const series = dailySeries(ex, state.entries, key);
  const pb = personalBest(ex, state.entries, key);
  const latest = latestAndPrevious(ex, state.entries, key).latest;
  const tries = attemptsOnDay(state.entries, ex.id, today);

  const aria = chartAriaLabel(
    ex,
    metric,
    latest ? latest.value : null,
    pb ? pb.value : null
  );

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
    valueFormatter: chartFormatter(metric),
    lowerIsBetter: metric ? metric.higherIsBetter === false : false,
    emptyText: L('noRecords'),
  });

  return `<div class="screen">
    ${detailHeader(ex)}
    <div class="detail-hero">
      <span class="big n-hero">${esc(latest ? formatValue(metric, latest.value) : '–')}</span>
      <span class="hero-unit">${esc(unit)}</span>
    </div>
    ${
      tries > 0
        ? `<p class="label tries-line"><span aria-hidden="true">💪</span> ${esc(
            T('triesToday', { n: tries })
          )}</p>`
        : ''
    }
    ${improvementOrPbHtml(ex, key)}
    ${rangeSwitchHtml()}
    <div class="curve-box">${svg}</div>
    ${statsHtml(ex, key)}
    ${stickersHtml(ex)}
    ${recordsHtml(ex)}
    <button type="button" class="fab" data-action="open-record" aria-label="${esc(T('addRecord'))}">＋</button>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* stickers + records                                                  */
/* ------------------------------------------------------------------ */

function stickerGridHtml(ex) {
  const list = stamps(ex, state.entries, state.settings.pullup);
  if (!list.length) return `<p class="label no-data-line">${esc(T('noData'))}</p>`;

  return `<ul class="sticker-grid" role="list">
    ${list
      .map((stamp) => {
        const label = state.lang === 'en' ? stamp.labelEn || stamp.label : stamp.label;
        const value = state.lang === 'en' ? stamp.valueTextEn || stamp.valueText : stamp.valueText;
        const aria = `${label} ${value}`.trim();
        return `<li class="sticker" role="listitem" aria-label="${esc(aria)}">
          <span class="sticker-icon" aria-hidden="true">${esc(stamp.icon || '')}</span>
          <span class="sticker-label">${esc(label)}</span>
          ${value ? `<span class="sticker-value">${esc(value)}</span>` : ''}
        </li>`;
      })
      .join('')}
  </ul>`;
}

function stickersHtml(ex) {
  return `<section class="stickers-section">
    <h2 class="label section-label">${esc(T('stickers'))}</h2>
    ${stickerGridHtml(ex)}
  </section>`;
}

function recordValuesText(ex, entry) {
  if (!entry) return '–';

  if (ex.id === 'pullup') {
    const n = stageOfEntry(entry);
    if (n === 1) return `✋ ${formatGrab(entry)}`;
    if (n === 2) {
      const metric = getMetric(ex, 'hang');
      const value = entryValue(ex, entry, 'hang');
      return `⏱️ ${metricValueText(metric, value, true)}`;
    }
    if (n === 3) {
      const value = entryValue(ex, entry, 'level');
      return `💪 ${formatValue(getMetric(ex, 'level'), value)}%`;
    }
    return `— ${L('oldRecord')}`;
  }

  if (ex.id === 'run') {
    const distanceMetric = getMetric(ex, 'distance');
    const distance = parseNum((entry.values || {}).distance);
    const duration = parseNum((entry.values || {}).duration);
    if (distance === null || duration === null) return '–';
    return `🏃 ${metricValueText(distanceMetric, distance, true)} · ${formatDuration(duration)}`;
  }

  if (ex.id === 'rope') {
    const repsMetric = getMetric(ex, 'reps');
    const reps = parseNum((entry.values || {}).reps);
    const duration = parseNum((entry.values || {}).duration);
    if (reps === null) return '–';
    const timeText = duration !== null ? ` · ${formatDuration(duration)}` : '';
    return `🪢 ${metricValueText(repsMetric, reps, true)}${timeText}`;
  }

  return '–';
}

function recordsHtml(ex) {
  const records = entriesFor(state.entries, ex.id).slice().reverse();
  if (!records.length) return '';

  return `<details class="records">
    <summary>${esc(T('record'))} (${records.length})</summary>
    <ul>
      ${records
        .map(
          (entry) => `<li class="rec">
            <span class="rec-date label">${esc(fmtDate(entry.date))}</span>
            <span class="rec-vals"><span class="rec-val">${esc(
              recordValuesText(ex, entry)
            )}</span></span>
            <button type="button" class="rec-del" data-action="delete-entry" data-id="${esc(
              entry.id
            )}" aria-label="${esc(T('delete'))}">🗑</button>
          </li>`
        )
        .join('')}
    </ul>
  </details>`;
}

/* ------------------------------------------------------------------ */
/* achievements                                                        */
/* ------------------------------------------------------------------ */

function achievementsHtml() {
  const sections = state.exercises
    .map(
      (ex) => `<section class="card sticker-card">
        <h2 class="curve-title">
          <span class="ex-icon" aria-hidden="true">${esc(ex.icon || '')}</span>
          <span>${esc(exName(ex))}</span>
        </h2>
        ${stickerGridHtml(ex)}
      </section>`
    )
    .join('');

  return `<div class="screen">
    <header class="topbar">
      <h1 class="screen-title">${esc(T('tabAchievements'))}</h1>
      <button type="button" class="icon-btn" data-action="open-settings" aria-label="${esc(
        T('settings')
      )}">⚙︎</button>
    </header>
    ${sections || `<p class="label no-data-line">${esc(T('noData'))}</p>`}
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
    const preselect =
      state.view === 'detail'
        ? state.detailId
        : currentExercise()
        ? currentExercise().id
        : null;
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
  } else if (action === 'run-distance') {
    const km = Number(el.dataset.km);
    if (state.detailId && Number.isFinite(km)) {
      state.runDistance[state.detailId] = km;
      state.animateCurve = true;
      render();
    }
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
  const first = body.querySelector(
    'input:not([disabled]), button:not([disabled]), select, textarea'
  );
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
        <button type="button" class="sheet-close" data-sheet-close="1" aria-label="${esc(
          T('close')
        )}">✕</button>
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
    const closer =
      event.target && event.target.closest ? event.target.closest('[data-sheet-close]') : null;
    if (closer) closeSheet();
  });

  api.setBody(opts.bodyHtml || '');
  if (typeof opts.onMount === 'function') opts.onMount(api);
  return api;
}

/* ------------------------------------------------------------------ */
/* quick-record sheet                                                  */
/* ------------------------------------------------------------------ */

function lastExerciseEntry(ex) {
  const list = entriesFor(state.entries, ex.id);
  return list.length ? list[list.length - 1] : null;
}

function prefillPullupStageValues(rs, ex, n) {
  if (n === 1) {
    rs.grabs = new Array(state.settings.pullup.attempts).fill(false);
    return;
  }

  const last = latestEntryForStage(ex, n);
  if (n === 2) {
    const value = last ? parseNum((last.values || {}).hang) : null;
    rs.values.hang = value !== null ? formatInputNumber(value) : '';
  }
  if (n === 3) {
    const value = last ? parseNum((last.values || {}).level) : null;
    rs.values.level = value !== null ? formatInputNumber(value) : '';
  }
}

function makeRecordState(selectedId) {
  const ex = findExercise(selectedId);
  const rs = {
    selected: selectedId,
    stage: 1,
    values: {},
    grabs: [],
    date: todayStr(),
    otherMode: false,
  };

  if (!ex) return rs;

  if (ex.id === 'pullup') {
    const progress = pullupProgress(ex);
    const unlocked = progress ? progress.stages.filter((s) => s.unlocked).map((s) => s.n) : [1];
    const current = progress ? progress.current : 1;
    rs.stage = unlocked.includes(current) ? current : 1;
    prefillPullupStageValues(rs, ex, rs.stage);
    return rs;
  }

  if (ex.id === 'run') {
    const last = lastExerciseEntry(ex);
    let distance = 1;
    let minutes = 7;
    let seconds = 0;
    if (last && last.values) {
      const d = parseNum(last.values.distance);
      const duration = parseNum(last.values.duration);
      if (d !== null) distance = d;
      if (duration !== null) {
        minutes = Math.floor(duration / 60);
        seconds = Math.round(duration % 60);
      }
    }
    rs.values.distance = formatInputNumber(distance);
    rs.values.minutes = String(minutes);
    rs.values.seconds = String(seconds);
    const options = runDistanceOptions(ex);
    rs.otherMode = !options.some((km) => Math.abs(km - distance) < 0.001);
    return rs;
  }

  if (ex.id === 'rope') {
    const last = lastExerciseEntry(ex);
    let reps = 20;
    let minutes = 0;
    let seconds = 30;
    if (last && last.values) {
      const r = parseNum(last.values.reps);
      const duration = parseNum(last.values.duration);
      if (r !== null) reps = r;
      if (duration !== null) {
        minutes = Math.floor(duration / 60);
        seconds = Math.round(duration % 60);
      }
    }
    rs.values.reps = String(reps);
    rs.values.minutes = String(minutes);
    rs.values.seconds = String(seconds);
    return rs;
  }

  return rs;
}

function stepSvg(dir) {
  return dir < 0
    ? '<svg class="step-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14" /></svg>'
    : '<svg class="step-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M12 5v14" /></svg>';
}

function stepButtonHtml(dir, key, step, min, max, ariaLabel) {
  const maxAttr = Number.isFinite(Number(max)) && max !== null && max !== '' ? ` data-max="${max}"` : '';
  return `<button type="button" class="step-btn" data-r-step="${dir}" data-key="${esc(
    key
  )}" data-step="${esc(step)}" data-min="${esc(min)}"${maxAttr} aria-label="${esc(ariaLabel)}">${stepSvg(
    dir
  )}</button>`;
}

function numberFieldHtml(label, key, value, unit, options = {}) {
  const step = options.step === undefined ? 1 : options.step;
  const min = options.min === undefined ? 0 : options.min;
  const max = options.max === undefined ? null : options.max;
  const raw = value === undefined || value === null ? '' : String(value);
  const inputmode = options.inputmode || 'decimal';

  return `<div class="field">
    <div class="field-head">
      <span class="label">${esc(label)}</span>
      ${unit ? `<span class="label field-unit">${esc(unit)}</span>` : ''}
    </div>
    <div class="field-row">
      ${stepButtonHtml(-1, key, step, min, max, `${label} ${L('dec')}`)}
      <input class="num-input" type="text" inputmode="${esc(inputmode)}" autocomplete="off" enterkeyhint="done" data-r-input="1" data-key="${esc(
        key
      )}" value="${esc(raw)}" aria-label="${esc(`${label}${unit ? ` (${unit})` : ''}`)}" />
      ${stepButtonHtml(1, key, step, min, max, `${label} ${L('inc')}`)}
    </div>
  </div>`;
}

function stageChooserHtml(ex) {
  const progress = pullupProgress(ex);
  if (!progress) return '';
  const unlocked = progress.stages.filter((s) => s.unlocked);
  if (unlocked.length <= 1) return '';

  return `<div class="field">
    <div class="field-head"><span class="label">${esc(L('chooseStage'))}</span></div>
    <div class="stage-choices" role="radiogroup" aria-label="${esc(L('chooseStage'))}">
      ${unlocked
        .map((progressStage) => {
          const def = ex.stages.find((s) => s.n === progressStage.n);
          const checked = recordState.stage === progressStage.n;
          return `<button type="button" class="stage-choice" role="radio" aria-checked="${checked}" data-r-stage="${esc(
            progressStage.n
          )}">
            <span class="stage-choice-icon" aria-hidden="true">${esc(def ? def.icon || '' : '')}</span>
            <span class="stage-choice-name">${esc(stageTitle(def))}</span>
            ${checked ? '<span class="choice-check" aria-hidden="true">✓</span>' : ''}
          </button>`;
        })
        .join('')}
    </div>
  </div>`;
}

function tryGridHtml() {
  const attempts = state.settings.pullup.attempts;
  const presses = Array.isArray(recordState.grabs) ? recordState.grabs : [];
  const count = presses.slice(0, attempts).filter(Boolean).length;

  const buttons = [];
  for (let i = 0; i < attempts; i += 1) {
    const pressed = !!presses[i];
    buttons.push(`<button type="button" class="try-btn" data-r-try="${i}" aria-pressed="${pressed}" aria-label="${esc(
      T('tryN', { n: i + 1 })
    )}">${pressed ? '<span aria-hidden="true">✋✓</span>' : `<span aria-hidden="true">${i + 1}</span>`}</button>`);
  }

  return `<div class="field">
    <p class="try-live big n-mid" data-try-live>${esc(T('grabbed'))} ${count} / ${attempts}</p>
    <div class="try-grid" role="group" aria-label="${esc(T('grabbed'))}">${buttons.join('')}</div>
  </div>`;
}

function levelFieldHtml() {
  const raw = parseNum(recordState.values.level);
  const current = raw === null ? 0 : clamp(raw, 0, 100);

  const quick = LEVEL_OPTIONS.map((option) => {
    const active = Math.abs(option.value - current) < 0.001;
    const label = state.lang === 'en' ? option.labelEn : option.label;
    return `<button type="button" class="level-opt" data-r-level="${option.value}" aria-pressed="${active}">
      <span class="level-illustration" aria-hidden="true">${pullupLevelSvg(option.value)}</span>
      <span class="level-pct big n-mid">${option.value}%</span>
      <span class="level-label">${esc(label)}</span>
      <span class="quick-check" aria-hidden="true">✓</span>
    </button>`;
  }).join('');

  return `<div class="field">
    <h3 class="sheet-subtitle">${esc(T('chooseLevel'))}</h3>
    <p class="judge-note">${esc(L('judgeNote'))}</p>
    <div class="field-row">
      ${stepButtonHtml(-1, 'level', 5, 0, 100, `${T('chooseLevel')} ${L('dec')}`)}
      <input class="num-input" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" data-r-input="1" data-key="level" value="${esc(
        recordState.values.level === undefined ? '' : recordState.values.level
      )}" aria-label="${esc(`${T('chooseLevel')} (%)`)}" />
      ${stepButtonHtml(1, 'level', 5, 0, 100, `${T('chooseLevel')} ${L('inc')}`)}
    </div>
    <div class="level-live" data-level-live>${pullupLevelSvg(current)}</div>
    <div class="level-grid">${quick}</div>
  </div>`;
}

function distanceChipsHtml(ex) {
  const options = runDistanceOptions(ex);
  const current = parseNum(recordState.values.distance);
  const isOther = !!recordState.otherMode;

  const chips = options.map((km) => {
    const checked = !isOther && current !== null && Math.abs(current - km) < 0.001;
    return `<button type="button" class="chip" role="radio" aria-checked="${checked}" data-r-distance="${esc(
      km
    )}">${esc(formatDistanceText(km))}</button>`;
  });

  chips.push(
    `<button type="button" class="chip" role="radio" aria-checked="${isOther}" data-r-distance="other">${esc(
      T('other')
    )}</button>`
  );

  return `<div class="field">
    <div class="field-head">
      <span class="label">${esc(T('distance'))}</span>
      <span class="label field-unit">${esc(metricUnit(getMetric(ex, 'distance')))}</span>
    </div>
    <div class="chip-group" role="radiogroup" aria-label="${esc(T('distance'))}">${chips.join('')}</div>
    ${
      isOther
        ? `<div class="field-row distance-other">
            <input class="num-input" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" data-r-input="1" data-key="distance" value="${esc(
              recordState.values.distance === undefined ? '' : recordState.values.distance
            )}" aria-label="${esc(`${T('distance')} (${metricUnit(getMetric(ex, 'distance'))})`)}" />
          </div>`
        : ''
    }
  </div>`;
}

function recordFieldsHtml(ex) {
  if (!ex) return '';

  if (ex.id === 'pullup') {
    if (recordState.stage === 1) return tryGridHtml();
    if (recordState.stage === 2) {
      return numberFieldHtml(
        T('longestHang'),
        'hang',
        recordState.values.hang,
        T('seconds'),
        { step: 1, min: 0 }
      );
    }
    return levelFieldHtml();
  }

  if (ex.id === 'run') {
    return `${distanceChipsHtml(ex)}
      <div class="field">
        <div class="field-head"><span class="label">${esc(T('time'))}</span></div>
        <div class="time-row">
          ${numberFieldHtml(T('minutes'), 'minutes', recordState.values.minutes, '', {
            step: 1,
            min: 0,
          })}
          ${numberFieldHtml(T('seconds'), 'seconds', recordState.values.seconds, '', {
            step: 1,
            min: 0,
          })}
        </div>
      </div>`;
  }

  if (ex.id === 'rope') {
    return `${numberFieldHtml(T('record'), 'reps', recordState.values.reps, '次', {
      step: 1,
      min: 0,
    })}
      <div class="field">
        <div class="field-head"><span class="label">${esc(T('time'))}</span></div>
        <div class="time-row">
          ${numberFieldHtml(T('minutes'), 'minutes', recordState.values.minutes, '', {
            step: 1,
            min: 0,
          })}
          ${numberFieldHtml(T('seconds'), 'seconds', recordState.values.seconds, '', {
            step: 1,
            min: 0,
          })}
        </div>
      </div>`;
  }

  return '';
}

function canSaveRecord(ex) {
  if (!ex) return false;

  if (ex.id === 'pullup') {
    if (recordState.stage === 1) return true;
    if (recordState.stage === 2) {
      const hang = parseNum(recordState.values.hang);
      return hang !== null && hang >= 0;
    }
    const level = parseNum(recordState.values.level);
    return level !== null && level >= 0 && level <= 100;
  }

  if (ex.id === 'run') {
    const distance = parseNum(recordState.values.distance);
    const minutes = parseNum(recordState.values.minutes) || 0;
    const seconds = parseNum(recordState.values.seconds) || 0;
    return distance !== null && distance > 0 && minutes * 60 + seconds > 0;
  }

  if (ex.id === 'rope') {
    const reps = parseNum(recordState.values.reps);
    const minutes = parseNum(recordState.values.minutes) || 0;
    const seconds = parseNum(recordState.values.seconds) || 0;
    return reps !== null && reps > 0 && minutes * 60 + seconds > 0;
  }

  return false;
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

  const stageChooser = ex.id === 'pullup' ? stageChooserHtml(ex) : '';
  const canSave = canSaveRecord(ex);

  return `<div class="ex-choices" role="radiogroup" aria-label="${esc(T('chooseExercise'))}">${choices}</div>
    ${stageChooser}
    <div class="fields">${recordFieldsHtml(ex)}</div>
    <div class="field">
      <div class="field-head"><label class="label" for="rec-date">${esc(T('date'))}</label></div>
      <input id="rec-date" class="date-input" type="date" data-r-date="1" value="${esc(
        recordState.date
      )}" max="${esc(todayStr())}" />
    </div>
    <button type="button" class="primary-btn" data-r-save="1" ${canSave ? '' : 'disabled'}>${esc(
      T('save')
    )}</button>`;
}

function syncSaveButton(api) {
  const ex = findExercise(recordState.selected);
  const btn = api.body.querySelector('[data-r-save]');
  if (btn) btn.disabled = !canSaveRecord(ex);
}

function updateTryLive(api) {
  const live = api.body.querySelector('[data-try-live]');
  if (!live) return;
  const attempts = state.settings.pullup.attempts;
  const count = (recordState.grabs || []).slice(0, attempts).filter(Boolean).length;
  live.textContent = `${T('grabbed')} ${count} / ${attempts}`;
}

function updateLevelWidgets(api) {
  const raw = parseNum(recordState.values.level);
  const value = raw === null ? 0 : clamp(raw, 0, 100);

  const live = api.body.querySelector('[data-level-live]');
  if (live) live.innerHTML = pullupLevelSvg(value);

  const buttons = api.body.querySelectorAll('[data-r-level]');
  buttons.forEach((btn) => {
    const active = Math.abs(Number(btn.dataset.rLevel) - value) < 0.001;
    btn.setAttribute('aria-pressed', String(active));
  });
}

function openRecordSheet(preselectId) {
  const fallback =
    state.view === 'detail' && state.detailId
      ? state.detailId
      : currentExercise()
      ? currentExercise().id
      : null;
  const selected = findExercise(preselectId) ? preselectId : fallback;
  recordState = makeRecordState(selected);

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
        recordState = makeRecordState(id);
        api.setBody(recordSheetHtml(), undefined, '.num-input');
      }
      return;
    }

    const stageBtn = target.closest('[data-r-stage]');
    if (stageBtn) {
      const stage = Number(stageBtn.dataset.rStage);
      const ex = findExercise(recordState.selected);
      if (ex && Number.isFinite(stage) && stage !== recordState.stage) {
        recordState.stage = stage;
        recordState.values = {};
        prefillPullupStageValues(recordState, ex, stage);
        api.setBody(recordSheetHtml());
      }
      return;
    }

    const distanceBtn = target.closest('[data-r-distance]');
    if (distanceBtn) {
      const raw = distanceBtn.dataset.rDistance;
      if (raw === 'other') {
        recordState.otherMode = true;
      } else {
        const km = parseNum(raw);
        if (km !== null) {
          recordState.otherMode = false;
          recordState.values.distance = formatInputNumber(km);
        }
      }
      api.setBody(recordSheetHtml());
      return;
    }

    const tryBtn = target.closest('[data-r-try]');
    if (tryBtn) {
      const idx = Number(tryBtn.dataset.rTry);
      if (Number.isInteger(idx)) {
        if (!Array.isArray(recordState.grabs)) recordState.grabs = [];
        recordState.grabs[idx] = !recordState.grabs[idx];
        const pressed = !!recordState.grabs[idx];
        tryBtn.setAttribute('aria-pressed', String(pressed));
        tryBtn.innerHTML = pressed
          ? '<span aria-hidden="true">✋✓</span>'
          : `<span aria-hidden="true">${idx + 1}</span>`;
        updateTryLive(api);
      }
      return;
    }

    const levelBtn = target.closest('[data-r-level]');
    if (levelBtn) {
      const value = parseNum(levelBtn.dataset.rLevel);
      if (value !== null) {
        recordState.values.level = formatInputNumber(value);
        const input = api.body.querySelector('[data-r-input][data-key="level"]');
        if (input) input.value = recordState.values.level;
        updateLevelWidgets(api);
        syncSaveButton(api);
      }
      return;
    }

    const stepBtn = target.closest('[data-r-step]');
    if (stepBtn) {
      const key = stepBtn.dataset.key;
      const dir = Number(stepBtn.dataset.rStep) || 0;
      const step = Number(stepBtn.dataset.step) || 1;
      const min = Number(stepBtn.dataset.min) || 0;
      const max = stepBtn.dataset.max ? Number(stepBtn.dataset.max) : Infinity;

      let current = parseNum(recordState.values[key]);
      if (current === null) current = 0;
      let next = current + dir * step;
      next = Math.max(min, Math.min(max, next));
      if (key === 'level') next = clamp(next, 0, 100);
      if (Number.isInteger(step) && key !== 'distance') next = Math.round(next);

      recordState.values[key] = formatInputNumber(next);
      const input = api.body.querySelector(`[data-r-input][data-key="${key}"]`);
      if (input) input.value = recordState.values[key];
      if (key === 'level') updateLevelWidgets(api);
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
      if (input.dataset.key === 'level') updateLevelWidgets(api);
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

  if (ex.id === 'pullup') {
    if (recordState.stage === 1) {
      const attempts = state.settings.pullup.attempts;
      const grabs = (recordState.grabs || []).slice(0, attempts).filter(Boolean).length;
      values.grabs = grabs;
      values.attempts = attempts;
    } else if (recordState.stage === 2) {
      const hang = parseNum(recordState.values.hang);
      if (hang === null || hang < 0) return;
      values.hang = hang;
    } else {
      const level = parseNum(recordState.values.level);
      if (level === null) return;
      values.level = clamp(level, 0, 100);
    }
  } else if (ex.id === 'run') {
    const distance = parseNum(recordState.values.distance);
    const minutes = parseNum(recordState.values.minutes) || 0;
    const seconds = parseNum(recordState.values.seconds) || 0;
    const duration = Math.round(minutes * 60 + seconds);
    if (distance === null || distance <= 0 || duration <= 0) return;
    values.distance = distance;
    values.duration = duration;
  } else if (ex.id === 'rope') {
    const reps = parseNum(recordState.values.reps);
    const minutes = parseNum(recordState.values.minutes) || 0;
    const seconds = parseNum(recordState.values.seconds) || 0;
    const duration = Math.round(minutes * 60 + seconds);
    if (reps === null || reps <= 0 || duration <= 0) return;
    values.reps = Math.round(reps);
    values.duration = duration;
  } else {
    return;
  }

  const date = recordState.date || todayStr();
  const draft = {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    exerciseId: ex.id,
    date,
    createdAt: Date.now(),
    values,
  };

  const previous = entriesFor(state.entries, ex.id);
  const newStamps = newStampsForSave(ex, previous, draft, state.settings.pullup);
  const runCompare =
    ex.id === 'run' ? runCompareLast(ex, previous.concat([draft])) : null;

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

  if (newStamps.length) {
    celebrate(state.celebration);
    vibrate([30, 40, 30]);

    const first = newStamps[0];
    const label = state.lang === 'en' ? first.labelEn || first.label : first.label;
    const value = state.lang === 'en' ? first.valueTextEn || first.valueText : first.valueText;
    toast(`${T('newSticker')} ${first.icon || ''} ${label} ${value}`.trim());
  } else if (runCompare && runCompare.fasterBy) {
    toast(formatFaster(runCompare.fasterBy, state.lang));
  }

  const savedId = saved.id;
  window.setTimeout(() => {
    if (state.highlightEntryId === savedId) state.highlightEntryId = null;
  }, 1300);
}

/* ------------------------------------------------------------------ */
/* settings sheet                                                      */
/* ------------------------------------------------------------------ */

function parentStepperHtml(key, label, display, minusLabel, plusLabel) {
  return `<div class="parent-row">
    <span class="label parent-label">${esc(label)}</span>
    <div class="parent-control">
      <button type="button" class="step-btn" data-parent-step="${esc(key)}" data-dir="-1" aria-label="${esc(
        minusLabel
      )}">${stepSvg(-1)}</button>
      <span class="parent-value big n-mid">${esc(display)}</span>
      <button type="button" class="step-btn" data-parent-step="${esc(key)}" data-dir="1" aria-label="${esc(
        plusLabel
      )}">${stepSvg(1)}</button>
    </div>
  </div>`;
}

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

  const pullup = state.settings.pullup;

  const parent = `<div class="sheet-section">
      <h3 class="label section-label">👪 ${esc(T('parentSettings'))}</h3>
      ${parentStepperHtml(
        'attempts',
        T('attemptsPerSession'),
        String(pullup.attempts),
        `${T('attemptsPerSession')} ${L('dec')}`,
        `${T('attemptsPerSession')} ${L('inc')}`
      )}
      ${parentStepperHtml(
        'stage1Grabs',
        T('unlockStage2'),
        `${pullup.stage1Grabs} / ${pullup.attempts}`,
        `${T('unlockStage2')} ${L('dec')}`,
        `${T('unlockStage2')} ${L('inc')}`
      )}
      ${parentStepperHtml(
        'stage2Hang',
        T('unlockStage3'),
        `${pullup.stage2Hang} ${T('seconds')}`,
        `${T('unlockStage3')} ${L('dec')}`,
        `${T('unlockStage3')} ${L('inc')}`
      )}
    </div>`;

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
    ${parent}
    ${dev}`;
}

function openSettings() {
  const api = openSheet({ title: T('settings'), bodyHtml: settingsHtml() });

  api.body.addEventListener('click', async (event) => {
    const target = event.target;
    if (!target || !target.closest) return;

    const parentBtn = target.closest('[data-parent-step]');
    if (parentBtn) {
      const key = parentBtn.dataset.parentStep;
      const dir = Number(parentBtn.dataset.dir) || 0;
      const current = state.settings.pullup;
      const next = { ...current };

      if (key === 'attempts') {
        next.attempts = clamp(current.attempts + dir, 1, 10);
        next.stage1Grabs = clamp(next.stage1Grabs, 1, next.attempts);
      } else if (key === 'stage1Grabs') {
        next.stage1Grabs = clamp(current.stage1Grabs + dir, 1, current.attempts);
      } else if (key === 'stage2Hang') {
        next.stage2Hang = clamp(current.stage2Hang + dir, 1, 120);
      }

      state.settings.pullup = pullupSettings(next);
      setSetting('pullup', state.settings.pullup);
      render();
      api.setBody(settingsHtml(), T('settings'));
      return;
    }

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
