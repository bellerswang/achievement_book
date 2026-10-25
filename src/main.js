// 成就本 — minimal UI layer. One screen, one primary action.

import {
  toDateStr,
  entriesFor,
  dailySeries,
  personalBest,
  latestAndPrevious,
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
  formatDistance,
  stamps,
  newStampsForSave,
  entryValue,
  distanceKey,
  attemptsOnDay,
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
  clearDemoEntries,
  exportBackup,
  importBackup,
  getSetting,
  setSetting,
} from './db.js';
import { renderCurve } from './chart.js';
import { celebrate } from './celebrate.js';
import { makeDemoEntries } from './seed.js';
import { pullupLevelSvg } from './illustrations.js';
import {
  createGrabFlow,
  recordAttempt,
  undoAttempt,
  resetFlow,
  isComplete,
  flowToValues,
  grabFlowHtml,
} from './grabflow.js';

/* ------------------------------------------------------------------ */
/* local strings (things the shared i18n table does not carry)         */
/* ------------------------------------------------------------------ */

const LOCAL = {
  zh: {
    best: '最好',
    start: '点我开始',
    judgeNote: '按下巴相对单杠的位置判断',
    deleteConfirm: '确定删除这条记录吗？',
    clearConfirm: '确定要清空所有记录吗？',
    noRecords: '还没有记录',
    goalGrabs: '达标：抓住几下得贴纸',
    chartBest: '{name}：最好 {pb}',
    unlockNext: '自动解锁下一关',
    pullupRules: '单杠门槛',
    dec: '减少',
    inc: '增加',
    stagePick: '选关卡',
    distancePick: '选距离',
    clearAll: '清空全部',
    reps: '次',
    triesLine: '今天试了 {n} 次',
  },
  en: {
    best: 'Best',
    start: 'Tap to start',
    judgeNote: 'Judge by where the chin is compared with the bar',
    deleteConfirm: 'Delete this record?',
    clearConfirm: 'Clear all records?',
    noRecords: 'No records yet',
    goalGrabs: 'Goal: grabs for a sticker',
    chartBest: '{name}: best {pb}',
    unlockNext: 'Unlock next stage automatically',
    pullupRules: 'Pull-up rules',
    dec: 'decrease',
    inc: 'increase',
    stagePick: 'Choose stage',
    distancePick: 'Choose distance',
    clearAll: 'Clear everything',
    reps: 'reps',
    triesLine: '{n} tries today',
  },
};

const DISTANCE_OPTIONS = [100, 200, 400, 600, 800, 1000];

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
  view: 'home', // 'home' | 'sport' | 'parent'
  sportId: null,
  stageSel: {},
  runSel: {},
  showHidden: false,
  lang: getSetting('lang', 'zh') === 'en' ? 'en' : 'zh',
  celebration: ['stars', 'sparkle', 'confetti'].includes(getSetting('celebration', 'stars'))
    ? getSetting('celebration', 'stars')
    : 'stars',
  settings: {
    pullup: pullupSettings(getSetting('pullup', {})),
  },
};

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

let sheet = null;
let rs = null; // record sheet state

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
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

function parseNum(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(',', '.');
  if (s === '') return null;
  if (!/^\d*\.?\d*$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fmtNum(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '–';
  return String(Math.round(Number(n)));
}

function fmtDate(dateStr) {
  const parts = String(dateStr || '').split('-').map(Number);
  const [, m, d] = parts;
  if (!Number.isFinite(m) || !Number.isFinite(d)) return String(dateStr || '');
  return state.lang === 'en' ? `${m}/${d}` : `${m}月${d}日`;
}

function vibrate(pattern) {
  try {
    if (navigator && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

function toast(message) {
  if (!message) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = message;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 2800);
}

function scrollTop() {
  try {
    window.scrollTo(0, 0);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* exercise / metric helpers                                           */
/* ------------------------------------------------------------------ */

function findExercise(id) {
  if (!id) return null;
  return state.exercises.find((e) => e && e.id === id) || null;
}

function exName(ex) {
  if (!ex) return '';
  return state.lang === 'en' ? ex.nameEn || ex.name : ex.name;
}

function stageName(stage) {
  if (!stage) return '';
  return state.lang === 'en' ? stage.nameEn || stage.name : stage.name;
}

function metricLabel(metric) {
  if (!metric) return '';
  return state.lang === 'en' ? metric.labelEn || metric.label : metric.label;
}

function metricUnit(metric) {
  if (!metric) return '';
  return state.lang === 'en' ? metric.unitEn || metric.unit : metric.unit;
}

function fmtMetric(metric, value) {
  const text = formatValue(metric, value);
  const unit = metricUnit(metric);
  if (!unit) return text;
  if (unit === '%') return `${text}%`;
  return `${text} ${unit}`;
}

/* ------------------------------------------------------------------ */
/* pull-up helpers                                                     */
/* ------------------------------------------------------------------ */

function pullupProgress(ex) {
  if (!ex || ex.id !== 'pullup') return null;
  return stageProgress(ex, state.entries, state.settings.pullup);
}

// Stage to SHOW by default: current stage once it has data, otherwise the
// highest stage that has data (so May never lands on an empty page).
function defaultStage(ex) {
  const progress = pullupProgress(ex);
  if (!progress) return 1;
  const withData = progress.stages.filter((s) => s.unlocked && s.entries > 0).map((s) => s.n);
  if (!withData.length) return progress.current;
  if (withData.includes(progress.current)) return progress.current;
  return Math.max(...withData);
}

function selectedStage(ex) {
  const progress = pullupProgress(ex);
  if (!progress) return 1;
  const unlocked = progress.stages.filter((s) => s.unlocked).map((s) => s.n);
  const saved = state.stageSel[ex.id];
  if (unlocked.includes(saved)) return saved;
  return defaultStage(ex);
}

function stageBest(ex, n) {
  const key = n === 1 ? 'grabRate' : n === 2 ? 'hang' : 'level';
  const list = entriesFor(state.entries, ex.id).filter((e) => stageOfEntry(e) === n);
  let bestEntry = null;
  let bestValue = -Infinity;
  for (const entry of list) {
    const v = entryValue(ex, entry, key);
    if (v === null) continue;
    if (v > bestValue) {
      bestValue = v;
      bestEntry = entry;
    }
  }
  if (!bestEntry) return null;
  if (n === 1) return { big: formatGrab(bestEntry), unit: '' };
  if (n === 2) return { big: formatValue(getMetric(ex, 'hang'), bestValue), unit: T('seconds') };
  return { big: formatValue(getMetric(ex, 'level'), bestValue), unit: '%' };
}

/* ------------------------------------------------------------------ */
/* running helpers                                                     */
/* ------------------------------------------------------------------ */

function selectedDistance(ex) {
  const list = runDistances(ex, state.entries);
  if (!list.length) return null;
  const saved = state.runSel[ex.id];
  if (Number.isFinite(saved) && list.includes(saved)) return saved;
  const cmp = runCompareLast(ex, state.entries);
  if (cmp && list.includes(cmp.distance)) return cmp.distance;
  return list[list.length - 1];
}

function runTileLine(ex) {
  const cmp = runCompareLast(ex, state.entries);
  if (!cmp) return null;
  return { stage: formatDistance(cmp.distance, state.lang), big: formatDuration(cmp.best) };
}

/* ------------------------------------------------------------------ */
/* home                                                                */
/* ------------------------------------------------------------------ */

function tileInfo(ex) {
  if (!ex) return null;
  if (ex.id === 'pullup') {
    const p = pullupProgress(ex);
    if (!p) return null;
    const n = defaultStage(ex);
    const s = p.stages.find((x) => x.n === n);
    if (!s || s.entries === 0) return null;
    const best = stageBest(ex, n);
    if (!best) return null;
    return { stage: `${T('stage', { n })} ${stageName(ex.stages.find((d) => d.n === n))}`, big: `${best.big}${best.unit ? ` ${best.unit}` : ''}` };
  }
  if (ex.id === 'run') return runTileLine(ex);
  if (ex.id === 'rope') {
    const best = personalBest(ex, state.entries, 'reps');
    if (!best) return null;
    return { stage: '', big: `${formatValue(getMetric(ex, 'reps'), best.value)} ${L('reps')}` };
  }
  return null;
}

function tileHtml(ex) {
  if (!ex) return '';
  const name = exName(ex);
  const info = tileInfo(ex);
  const aria = info
    ? `${name}，${info.stage ? `${info.stage} ` : ''}${info.big}`
    : `${name}，${L('start')}`;
  const line = info
    ? `<span class="tile-line">
         ${info.stage ? `<span class="tile-stage">${esc(info.stage)}</span><span class="tile-sep" aria-hidden="true">·</span>` : ''}
         <span class="tile-big">${esc(info.big)}</span>
       </span>`
    : `<span class="tile-line tile-hint">${esc(L('start'))}</span>`;

  return `<button type="button" class="tile" data-action="open-sport" data-id="${esc(ex.id)}" aria-label="${esc(aria)}">
    <span class="tile-emoji" aria-hidden="true">${esc(ex.icon || '')}</span>
    <span class="tile-name">${esc(name)}</span>
    ${line}
  </button>`;
}

function homeHtml() {
  const tiles = ['pullup', 'run']
    .map((id) => tileHtml(findExercise(id)))
    .filter(Boolean);
  if (state.showHidden) {
    const rope = tileHtml(findExercise('rope'));
    if (rope) tiles.push(rope);
  }

  return `<div class="screen home">
    <header class="home-top">
      <h1 class="app-title">成就本</h1>
      <button type="button" class="parent-btn" data-action="open-parent" aria-label="家长区 / Parents">👪</button>
    </header>
    <div class="tiles">${tiles.join('')}</div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* sport page                                                          */
/* ------------------------------------------------------------------ */

function sportHtml() {
  const ex = findExercise(state.sportId);
  if (!ex) return homeHtml();

  let body = '';
  if (ex.id === 'pullup') body = pullupBody(ex);
  else if (ex.id === 'run') body = runBody(ex);
  else body = simpleBody(ex);

  return `<div class="screen has-record">
    <header class="sport-head">
      <button type="button" class="back-btn" data-action="back" aria-label="${esc(T('back'))}">‹</button>
      <h1 class="sport-title"><span aria-hidden="true">${esc(ex.icon || '')}</span> ${esc(exName(ex))}</h1>
    </header>
    ${body}
    <div class="record-bar">
      <button type="button" class="record-btn" data-action="open-record">
        <svg class="plus-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M12 5v14" /></svg>
        <span>${esc(T('record'))}</span>
      </button>
    </div>
  </div>`;
}

function heroHtml(label, big, unit, noteHtml, noteClass) {
  return `<section class="hero">
    <p class="hero-label">${esc(label)}</p>
    <p class="hero-value"><span class="hero-num">${esc(big)}</span>${
    unit ? `<span class="hero-unit">${esc(unit)}</span>` : ''
  }</p>
    ${noteHtml ? `<p class="hero-note${noteClass ? ` ${noteClass}` : ''}">${noteHtml}</p>` : ''}
  </section>`;
}

function roadHtml(ex, progress, sel) {
  if (!progress) return '';
  const unlocked = progress.stages.filter((s) => s.unlocked).sort((a, b) => b.n - a.n);
  const highest = unlocked.length ? unlocked[0].n : 0;
  const nodes = [];

  if (highest < 3) {
    nodes.push(
      `<li class="road-node road-next" aria-label="${esc(T('nextStageHidden'))}"><span aria-hidden="true">?</span></li>`
    );
  }

  for (const ps of unlocked) {
    const def = ex.stages.find((d) => d.n === ps.n);
    if (!def) continue;
    const isCurrent = ps.n === progress.current;
    const isSel = ps.n === sel;
    nodes.push(`<li>
      <button type="button" class="road-node${isCurrent ? ' is-current' : ''}" data-action="select-stage" data-n="${ps.n}" aria-pressed="${isSel}">
        <span class="road-ico" aria-hidden="true">${esc(def.icon || '')}</span>
        <span class="road-name">${esc(T('stage', { n: ps.n }))}</span>
        ${isCurrent ? `<span class="road-here" aria-hidden="true">📍</span>` : ''}
        ${isSel ? `<span class="road-chk" aria-hidden="true">✓</span>` : ''}
      </button>
    </li>`);
  }

  return `<nav class="road" aria-label="${esc(T('road'))}"><ol class="road-list">${nodes.join('')}</ol></nav>`;
}

function stickersHtml(ex) {
  const list = stamps(ex, state.entries, state.settings.pullup);
  const inner = list.length
    ? `<ul class="sticker-grid">${list
        .map((stamp) => {
          const label = state.lang === 'en' ? stamp.labelEn || stamp.label : stamp.label;
          const value = state.lang === 'en' ? stamp.valueTextEn || stamp.valueText : stamp.valueText;
          return `<li class="sticker" aria-label="${esc(`${label} ${value}`.trim())}">
            <span class="sticker-icon" aria-hidden="true">${esc(stamp.icon || '')}</span>
            <span class="sticker-label">${esc(label)}</span>
            ${value ? `<span class="sticker-value">${esc(value)}</span>` : ''}
          </li>`;
        })
        .join('')}</ul>`
    : '';
  if (!inner) return '';

  return `<section class="stickers">
    <h2 class="section-label">${esc(T('stickers'))}</h2>
    ${inner}
  </section>`;
}

function pullupBody(ex) {
  const progress = pullupProgress(ex);
  const sel = selectedStage(ex);
  const def = ex.stages.find((s) => s.n === sel) || ex.stages[0];
  const key = def.metric;
  const metric = getMetric(ex, key);
  const best = personalBest(ex, state.entries, key);
  const lp = latestAndPrevious(ex, state.entries, key);
  const series = dailySeries(ex, state.entries, key);
  const bestNow = stageBest(ex, sel);
  const tries = attemptsOnDay(state.entries, ex.id, todayStr());

  const aria = L('chartBest', {
    name: `${exName(ex)} ${T('stage', { n: sel })}`,
    pb: bestNow ? `${bestNow.big}${sel === 1 ? '' : bestNow.unit || ''}` : '–',
  });

  const svg = renderCurve({
    series,
    metricLabel: metricLabel(metric),
    unit: metricUnit(metric),
    range: 'all',
    today: todayStr(),
    height: 220,
    pbDate: best ? best.date : null,
    ariaLabel: aria,
    valueFormatter: (value) => fmtMetric(metric, value),
    lowerIsBetter: false,
    emptyText: L('noRecords'),
  });

  const note =
    tries > 0 ? `<span aria-hidden="true">💪</span> ${esc(L('triesLine', { n: tries }))}` : '';

  if (!bestNow) {
    // Nothing recorded for this stage yet: one clear line, no empty hero/chart.
    return `${roadHtml(ex, progress, sel)}
    <p class="big-empty">${esc(T('tapToRecord'))}</p>
    ${stickersHtml(ex)}`;
  }

  return `${roadHtml(ex, progress, sel)}
    ${heroHtml(L('best'), bestNow ? bestNow.big : '–', sel === 1 ? '' : bestNow ? bestNow.unit : '', note)}
    ${series.length >= 2 ? `<div class="chart-box">${svg}</div>` : ''}
    ${stickersHtml(ex)}`;
}

function runBody(ex) {
  const dists = runDistances(ex, state.entries);
  const sel = selectedDistance(ex);

  if (sel === null) {
    return `<p class="big-empty">${esc(T('noRunYet'))}<br />${esc(T('tapToRecord'))}</p>`;
  }

  const picker = `<div class="chip-group" role="radiogroup" aria-label="${esc(L('distancePick'))}">
    ${dists
      .map((m) => {
        const on = m === sel;
        return `<button type="button" class="chip" role="radio" aria-checked="${on}" data-action="select-distance" data-m="${m}">${esc(
          formatDistance(m, state.lang)
        )}${on ? '<span class="chk" aria-hidden="true"> ✓</span>' : ''}</button>`;
      })
      .join('')}
  </div>`;

  const bestMap = runBestByDistance(ex, state.entries);
  const best = bestMap[distanceKey(sel)];
  const series = runTimeSeries(ex, state.entries, sel);
  const latest = series.length ? series[series.length - 1].value : null;
  const cmp = runCompareLast(ex, state.entries);
  const faster = cmp && cmp.distance === sel && cmp.fasterBy ? cmp.fasterBy : null;

  const aria = L('chartBest', {
    name: `${exName(ex)} ${formatDistance(sel, state.lang)}`,
    pb: best ? formatDuration(best.seconds) : '–',
  });

  const svg = renderCurve({
    series,
    metricLabel: T('time'),
    unit: T('seconds'),
    range: 'all',
    today: todayStr(),
    height: 220,
    pbDate: best ? best.date : null,
    ariaLabel: aria,
    valueFormatter: (value) => formatDuration(value),
    lowerIsBetter: true,
    emptyText: L('noRecords'),
  });

  const note = faster
    ? `<span aria-hidden="true">▲</span> ${esc(formatFaster(faster, state.lang))}`
    : '';

  return `${picker}
    ${heroHtml(`${formatDistance(sel, state.lang)} ${T('bestTime')}`, best ? formatDuration(best.seconds) : '–', '', note, 'is-up')}
    ${series.length >= 2 ? `<div class="chart-box">${svg}</div>` : ''}
    ${stickersHtml(ex)}`;
}

function simpleBody(ex) {
  const key = ex.defaultChartMetric || (ex.metrics && ex.metrics[0] && ex.metrics[0].key) || 'reps';
  const metric = getMetric(ex, key);
  const best = personalBest(ex, state.entries, key);
  const lp = latestAndPrevious(ex, state.entries, key);
  const series = dailySeries(ex, state.entries, key);

  const aria = L('chartBest', {
    name: exName(ex),
    pb: best ? fmtMetric(metric, best.value) : '–',
  });

  const svg = renderCurve({
    series,
    metricLabel: metricLabel(metric),
    unit: metricUnit(metric),
    range: 'all',
    today: todayStr(),
    height: 220,
    pbDate: best ? best.date : null,
    ariaLabel: aria,
    valueFormatter: (value) => fmtMetric(metric, value),
    lowerIsBetter: false,
    emptyText: L('noRecords'),
  });

  return `${heroHtml(L('best'), best ? formatValue(metric, best.value) : '–', metricUnit(metric), '')}
    ${series.length >= 2 ? `<div class="chart-box">${svg}</div>` : ''}
    ${stickersHtml(ex)}`;
}

/* ------------------------------------------------------------------ */
/* parent page                                                         */
/* ------------------------------------------------------------------ */

function prowHtml(key, label, value, unit) {
  return `<div class="prow">
    <span class="prow-label">${esc(label)}</span>
    <div class="prow-ctrl">
      <button type="button" class="step-btn" data-parent-step="${esc(key)}" data-dir="-1" aria-label="${esc(
        `${label} ${L('dec')}`
      )}">${stepSvg(-1)}</button>
      <span class="prow-value">${esc(value)}${unit ? `<span class="prow-unit"> ${esc(unit)}</span>` : ''}</span>
      <button type="button" class="step-btn" data-parent-step="${esc(key)}" data-dir="1" aria-label="${esc(
        `${label} ${L('inc')}`
      )}">${stepSvg(1)}</button>
    </div>
  </div>`;
}

function recordText(ex, entry) {
  if (!entry) return '';
  const v = entry.values || {};
  if (ex.id === 'pullup') {
    const n = stageOfEntry(entry);
    if (n === 1) return `✋ ${formatGrab(entry)}`;
    if (n === 2) return `⏱️ ${fmtNum(v.hang)} ${T('seconds')}`;
    if (n === 3) return `💪 ${fmtNum(v.level)}%`;
    return '–';
  }
  if (ex.id === 'run') {
    const d = parseNum(v.distance);
    const s = parseNum(v.duration);
    if (d === null || s === null) return '–';
    const laps = parseNum(v.laps);
    return `🏃 ${formatDistance(d, state.lang)} · ${formatDuration(s)}${
      laps ? ` · ${fmtNum(laps)} ${T('laps')}` : ''
    }`;
  }
  if (ex.id === 'rope') {
    const reps = parseNum(v.reps);
    const s = parseNum(v.duration);
    return `🪢 ${reps === null ? '–' : fmtNum(reps)} ${L('reps')}${s ? ` · ${formatDuration(s)}` : ''}`;
  }
  return '–';
}

function manageHtml(ex) {
  const list = entriesFor(state.entries, ex.id).slice().reverse();
  if (!list.length) {
    return `<div class="mrec-empty muted"><span aria-hidden="true">${esc(ex.icon || '')}</span> ${esc(
      exName(ex)
    )} · ${esc(T('noData'))}</div>`;
  }
  return `<details class="mrec">
    <summary><span aria-hidden="true">${esc(ex.icon || '')}</span> ${esc(exName(ex))}</summary>
    <ul class="mrec-list">
      ${list
        .map(
          (entry) => `<li class="mrec-row">
            <span class="mrec-text">${esc(fmtDate(entry.date))} · ${esc(recordText(ex, entry))}</span>
            <button type="button" class="del-btn" data-action="delete-entry" data-id="${esc(
              entry.id
            )}" aria-label="${esc(T('delete'))}">✕</button>
          </li>`
        )
        .join('')}
    </ul>
  </details>`;
}

function parentHtml() {
  const pullup = state.settings.pullup;
  const demoCount = state.entries.filter((e) => e && e.demo === true).length;

  const celOptions = [
    ['stars', '⭐', T('stars')],
    ['sparkle', '✨', T('sparkle')],
    ['confetti', '🎉', T('confetti')],
  ]
    .map(([kind, icon, name]) => {
      const on = state.celebration === kind;
      return `<button type="button" class="opt" role="radio" aria-checked="${on}" data-cel="${esc(kind)}">
        <span aria-hidden="true">${icon}</span> ${esc(name)}${on ? '<span class="chk" aria-hidden="true"> ✓</span>' : ''}
      </button>`;
    })
    .join('');

  const langOptions = [
    ['zh', '中文'],
    ['en', 'English'],
  ]
    .map(([lang, label]) => {
      const on = state.lang === lang;
      return `<button type="button" class="opt" role="radio" aria-checked="${on}" data-lang="${esc(lang)}">${esc(
        label
      )}${on ? '<span class="chk" aria-hidden="true"> ✓</span>' : ''}</button>`;
    })
    .join('');

  const manage = ['pullup', 'run']
    .map((id) => {
      const ex = findExercise(id);
      return ex ? manageHtml(ex) : '';
    })
    .join('');

  const dev = IS_DEV
    ? `<section class="pcard">
        <h2 class="pcard-title">🛠 ${esc(T('demoData'))}</h2>
        <button type="button" class="pbtn" data-load-demo="1">${esc(T('loadDemo'))}</button>
      </section>`
    : '';

  return `<div class="screen parent">
    <header class="sport-head">
      <button type="button" class="back-btn" data-action="back" aria-label="${esc(T('back'))}">‹</button>
      <h1 class="sport-title">${esc(T('parentArea'))}</h1>
    </header>

    <section class="pcard">
      <h2 class="pcard-title">${esc(L('pullupRules'))}</h2>
      ${prowHtml('attempts', T('attemptsPerSession'), String(pullup.attempts), '')}
      ${prowHtml('stage1Grabs', L('goalGrabs'), `${pullup.stage1Grabs} / ${pullup.attempts}`, '')}
      <button type="button" class="switch-row" role="switch" aria-checked="${pullup.unlockNext === true}" data-toggle-unlock="1">
        <span>${esc(L('unlockNext'))}</span>
        <span class="switch" aria-hidden="true"><span class="knob"></span></span>
      </button>
      ${pullup.unlockNext ? prowHtml('stage2Hang', T('unlockStage3'), String(pullup.stage2Hang), T('seconds')) : ''}
    </section>

    <section class="pcard">
      <h2 class="pcard-title">${esc(T('celebration'))}</h2>
      <div class="opt-row" role="radiogroup" aria-label="${esc(T('celebration'))}">${celOptions}</div>
      <h2 class="pcard-title">${esc(T('language'))}</h2>
      <div class="opt-row" role="radiogroup" aria-label="${esc(T('language'))}">${langOptions}</div>
    </section>

    <section class="pcard">
      <h2 class="pcard-title">${esc(T('otherSports'))}</h2>
      <button type="button" class="switch-row" role="switch" aria-checked="${state.showHidden}" data-toggle-rope="1">
        <span>${esc(T('showRope'))}</span>
        <span class="switch" aria-hidden="true"><span class="knob"></span></span>
      </button>
    </section>

    <section class="pcard">
      <h2 class="pcard-title">${esc(T('backup'))}</h2>
      <button type="button" class="pbtn" data-export="1">${esc(T('exportBackup'))}</button>
      <button type="button" class="pbtn" data-import="1">${esc(T('importBackup'))}</button>
      <input type="file" accept="application/json,.json" data-import-file="1" hidden />
      <button type="button" class="pbtn" data-clear-demo="1" ${demoCount ? '' : 'disabled'}>${esc(
        T('clearDemo')
      )}</button>
      <button type="button" class="pbtn" data-clear-all="1">${esc(L('clearAll'))}</button>
    </section>

    <section class="pcard">
      <h2 class="pcard-title">${esc(T('manageRecords'))}</h2>
      ${manage || `<p class="muted">${esc(T('noData'))}</p>`}
    </section>

    ${dev}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* render                                                              */
/* ------------------------------------------------------------------ */

function render() {
  const app = document.getElementById('app');
  if (!app) return;
  let html;
  if (state.view === 'parent') html = parentHtml();
  else if (state.view === 'sport' && findExercise(state.sportId)) html = sportHtml();
  else {
    state.view = 'home';
    html = homeHtml();
  }
  app.innerHTML = html;
}

function renderAndFocus(selector) {
  render();
  if (!selector) return;
  const el = document.querySelector(selector);
  if (el && typeof el.focus === 'function') {
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }
}

/* ------------------------------------------------------------------ */
/* sheet component                                                     */
/* ------------------------------------------------------------------ */

function closeSheet() {
  if (sheet && sheet.wrap && sheet.wrap.parentNode) sheet.wrap.remove();
  sheet = null;
  document.body.classList.remove('sheet-open');
}

function trapFocus(wrap, event) {
  if (event.key !== 'Tab') return;
  const items = Array.from(
    wrap.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')
  ).filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
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
      <div class="sheet-body">${opts.bodyHtml || ''}</div>
    </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('sheet-open');

  const api = {
    wrap,
    body: wrap.querySelector('.sheet-body'),
  };
  sheet = api;

  wrap.addEventListener('click', (event) => {
    const closer = event.target && event.target.closest ? event.target.closest('[data-sheet-close]') : null;
    if (closer) closeSheet();
  });
  wrap.addEventListener('keydown', (event) => trapFocus(wrap, event));

  const dialog = wrap.querySelector('.sheet');
  if (dialog && typeof dialog.focus === 'function') {
    try {
      dialog.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  return api;
}

/* ------------------------------------------------------------------ */
/* record sheet — markup helpers                                       */
/* ------------------------------------------------------------------ */

function stepSvg(dir) {
  return dir < 0
    ? '<svg class="step-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14" /></svg>'
    : '<svg class="step-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M12 5v14" /></svg>';
}

function stepBtnHtml(key, dir, step, min, max, label) {
  return `<button type="button" class="step-btn" data-r-step="1" data-key="${esc(key)}" data-dir="${dir}" data-step="${esc(
    step
  )}" data-min="${esc(min)}" ${max === null || max === undefined ? '' : `data-max="${esc(max)}"`} aria-label="${esc(
    label
  )}">${stepSvg(dir)}</button>`;
}

function numberFieldHtml(key, label, value, unit, opts = {}) {
  const step = opts.step === undefined ? 1 : opts.step;
  const min = opts.min === undefined ? 0 : opts.min;
  const max = opts.max === undefined ? null : opts.max;
  const mode = opts.inputmode || 'numeric';
  const small = !!opts.small;
  const raw = value === undefined || value === null ? '' : String(value);

  return `<div class="field${small ? ' field-sm' : ''}">
    <span class="field-label">${esc(label)}${unit ? `<span class="field-unit"> ${esc(unit)}</span>` : ''}</span>
    <div class="field-row">
      ${stepBtnHtml(key, -1, step, min, max, `${label} ${L('dec')}`)}
      <input class="num-input" type="text" inputmode="${esc(mode)}" autocomplete="off" enterkeyhint="done" data-r-input="1" data-key="${esc(
    key
  )}" value="${esc(raw)}" aria-label="${esc(`${label}${unit ? ` (${unit})` : ''}`)}" />
      ${stepBtnHtml(key, 1, step, min, max, `${label} ${L('inc')}`)}
    </div>
  </div>`;
}

function tryGridHtml() {
  // Challenge flow: tap 抓住 / 没抓住 for each attempt; dots fill in order and
  // the result (e.g. 3 / 5) appears automatically after the last attempt.
  if (!rs.flow) rs.flow = createGrabFlow(state.settings.pullup.attempts);
  return grabFlowHtml(rs.flow, { lang: state.lang, esc });
}

function levelHtml() {
  const options = LEVEL_OPTIONS.map((option) => {
    const on = Number(rs.values.level) === option.value;
    const label = state.lang === 'en' ? option.labelEn : option.label;
    return `<button type="button" class="level-opt" data-r-level="${option.value}" aria-pressed="${on}">
      <span class="level-art" aria-hidden="true">${pullupLevelSvg(option.value)}</span>
      <span class="level-pct">${option.value}%</span>
      <span class="level-name">${esc(label)}</span>
      ${on ? '<span class="chk" aria-hidden="true">✓</span>' : ''}
    </button>`;
  }).join('');

  const exact = rs.showExact
    ? `<p class="judge-note">${esc(L('judgeNote'))}</p>
       <div class="field-row">
         ${stepBtnHtml('level', -1, 5, 0, 100, `${T('parentExact')} ${L('dec')}`)}
         <input class="num-input" type="text" inputmode="numeric" autocomplete="off" enterkeyhint="done" data-r-input="1" data-key="level" value="${esc(
           rs.values.level
         )}" aria-label="${esc(`${T('parentExact')} (%)`)}" />
         ${stepBtnHtml('level', 1, 5, 0, 100, `${T('parentExact')} ${L('inc')}`)}
       </div>`
    : `<button type="button" class="link-btn" data-r-exact="1">${esc(T('parentExact'))}</button>`;

  return `<div class="level-grid">${options}</div>${exact}`;
}

function pullupRecordHtml(ex) {
  const progress = pullupProgress(ex);
  const unlocked = progress ? progress.stages.filter((s) => s.unlocked) : [];
  const chooser =
    unlocked.length > 1
      ? `<div class="stage-row" role="radiogroup" aria-label="${esc(L('stagePick'))}">
          ${unlocked
            .map((s) => {
              const def = ex.stages.find((d) => d.n === s.n);
              const on = rs.stage === s.n;
              return `<button type="button" class="stage-chip" role="radio" aria-checked="${on}" data-r-stage="${s.n}">
                <span aria-hidden="true">${esc(def ? def.icon || '' : '')}</span> ${esc(T('stage', { n: s.n }))}${
                on ? '<span class="chk" aria-hidden="true"> ✓</span>' : ''
              }</button>`;
            })
            .join('')}
        </div>`
      : '';

  let fields = '';
  if (rs.stage === 1) fields = tryGridHtml();
  else if (rs.stage === 2)
    fields = numberFieldHtml('hang', T('longestHang'), rs.values.hang, T('seconds'), { step: 1, min: 0 });
  else fields = levelHtml();

  return chooser + fields;
}

function runRecordHtml() {
  const chips = DISTANCE_OPTIONS.map((m) => {
    const on = !rs.otherDistance && Number(rs.values.distance) === m;
    return `<button type="button" class="chip" role="radio" aria-checked="${on}" data-r-distance="${m}">${esc(
      formatDistance(m, state.lang)
    )}${on ? '<span class="chk" aria-hidden="true"> ✓</span>' : ''}</button>`;
  }).join('');

  const otherOn = !!rs.otherDistance;
  const otherChip = `<button type="button" class="chip" role="radio" aria-checked="${otherOn}" data-r-distance="other">${esc(
    T('other')
  )}${otherOn ? '<span class="chk" aria-hidden="true"> ✓</span>' : ''}</button>`;

  const otherInput = otherOn
    ? `<div class="field">
        <span class="field-label">${esc(T('customDistance'))}</span>
        <input class="num-input num-input-wide" type="text" inputmode="numeric" autocomplete="off" enterkeyhint="done" data-r-input="1" data-key="distanceCustom" value="${esc(
          rs.values.distanceCustom
        )}" aria-label="${esc(T('customDistance'))}" />
      </div>`
    : '';

  return `<div class="chip-group" role="radiogroup" aria-label="${esc(T('distance'))}">${chips}${otherChip}</div>
    ${otherInput}
    <div class="time-stack">
      ${numberFieldHtml('minutes', T('minutes'), rs.values.minutes, '', { step: 1, min: 0 })}
      ${numberFieldHtml('seconds', T('seconds'), rs.values.seconds, '', { step: 1, min: 0 })}
    </div>
    ${numberFieldHtml('laps', T('laps'), rs.values.laps, '', { step: 1, min: 0, small: true })}`;
}

function ropeRecordHtml() {
  return `${numberFieldHtml('reps', T('record'), rs.values.reps, L('reps'), { step: 1, min: 0 })}
    <div class="time-stack">
      ${numberFieldHtml('minutes', T('minutes'), rs.values.minutes, '', { step: 1, min: 0 })}
      ${numberFieldHtml('seconds', T('seconds'), rs.values.seconds, '', { step: 1, min: 0 })}
    </div>`;
}

function dateRowHtml() {
  if (rs.showDate) {
    return `<div class="date-row">
      <input class="date-input" type="date" data-r-date="1" value="${esc(rs.date)}" max="${esc(
      todayStr()
    )}" aria-label="${esc(T('date'))}" />
    </div>`;
  }
  const extra = rs.date !== todayStr() ? `<span class="muted">${esc(fmtDate(rs.date))}</span>` : '';
  return `<div class="date-row">${extra}<button type="button" class="link-btn" data-r-changedate="1">${esc(
    T('changeDate')
  )}</button></div>`;
}

function recordSheetHtml() {
  const ex = findExercise(rs.sport);
  if (!ex) return '';

  let body = '';
  if (ex.id === 'pullup') body = pullupRecordHtml(ex);
  else if (ex.id === 'run') body = runRecordHtml();
  else body = ropeRecordHtml();

  return `<div class="sheet-fields">${body}</div>
    ${dateRowHtml()}
    <button type="button" class="save-btn" data-r-save="1" ${canSave() ? '' : 'disabled'}>${esc(
    T('save')
  )}</button>`;
}

/* ------------------------------------------------------------------ */
/* record sheet — state                                                */
/* ------------------------------------------------------------------ */

function prefillStage(r, ex, n) {
  r.stage = n;
  r.flow = createGrabFlow(state.settings.pullup.attempts);
  r.values.hang = '';
  r.values.level = '';
  r.showExact = false;

  if (n === 1) {
    r.grabs = new Array(state.settings.pullup.attempts).fill(false);
    return;
  }
  const list = entriesFor(state.entries, ex.id).filter((e) => stageOfEntry(e) === n);
  const last = list.length ? list[list.length - 1] : null;
  if (!last) return;
  if (n === 2) {
    const v = parseNum(last.values.hang);
    if (v !== null) r.values.hang = String(Math.round(v));
  }
  if (n === 3) {
    const v = parseNum(last.values.level);
    if (v !== null) r.values.level = String(Math.round(v));
  }
}

function prefillRun(r, ex, metres) {
  const dist = Number.isFinite(metres) ? Math.round(metres) : 400;
  if (DISTANCE_OPTIONS.includes(dist)) {
    r.values.distance = String(dist);
    r.otherDistance = false;
  } else {
    r.otherDistance = true;
    r.values.distanceCustom = String(dist);
    r.values.distance = '';
  }

  const list = entriesFor(state.entries, ex.id).filter((e) => {
    const d = parseNum((e.values || {}).distance);
    const s = parseNum((e.values || {}).duration);
    return d !== null && s !== null && d > 0 && s > 0 && Math.round(d) === dist;
  });
  const last = list.length ? list[list.length - 1] : null;
  if (last) {
    const dur = parseNum(last.values.duration);
    r.values.minutes = String(Math.floor(dur / 60));
    r.values.seconds = String(Math.round(dur % 60));
  } else {
    r.values.minutes = '';
    r.values.seconds = '';
  }
  r.values.laps = '';
}

function makeRecordState(ex) {
  const r = {
    sport: ex.id,
    stage: 1,
    flow: createGrabFlow(state.settings.pullup.attempts),
    values: {
      hang: '',
      level: '',
      distance: '',
      distanceCustom: '',
      minutes: '',
      seconds: '',
      laps: '',
      reps: '',
    },
    otherDistance: false,
    showDate: false,
    showExact: false,
    date: todayStr(),
  };

  if (ex.id === 'pullup') {
    const progress = pullupProgress(ex);
    const unlocked = progress ? progress.stages.filter((s) => s.unlocked).map((s) => s.n) : [1];
    const target = unlocked.includes(defaultStage(ex)) ? defaultStage(ex) : unlocked[0];
    prefillStage(r, ex, target);
    return r;
  }

  if (ex.id === 'run') {
    const list = entriesFor(state.entries, ex.id);
    const last = list.length ? list[list.length - 1] : null;
    const dist = last ? parseNum((last.values || {}).distance) : null;
    prefillRun(r, ex, dist !== null ? Math.round(dist) : 400);
    return r;
  }

  if (ex.id === 'rope') {
    const list = entriesFor(state.entries, ex.id);
    const last = list.length ? list[list.length - 1] : null;
    const reps = last ? parseNum((last.values || {}).reps) : null;
    const dur = last ? parseNum((last.values || {}).duration) : null;
    r.values.reps = reps !== null ? String(Math.round(reps)) : '';
    r.values.minutes = dur !== null ? String(Math.floor(dur / 60)) : '';
    r.values.seconds = dur !== null ? String(Math.round(dur % 60)) : '';
    return r;
  }

  return r;
}

function canSave() {
  const ex = findExercise(rs && rs.sport);
  if (!ex) return false;
  return !!buildValues(ex);
}

function buildValues(ex) {
  if (!ex || !rs) return null;
  if (ex.id === 'pullup') {
    if (rs.stage === 1) {
      return rs.flow ? flowToValues(rs.flow) : null; // only once all attempts are done
    }
    if (rs.stage === 2) {
      const hang = parseNum(rs.values.hang);
      if (hang === null || hang < 0) return null;
      return { hang: Math.round(hang) };
    }
    const level = parseNum(rs.values.level);
    if (level === null) return null;
    return { level: clamp(Math.round(level), 0, 100) };
  }

  if (ex.id === 'run') {
    const dist = rs.otherDistance
      ? parseNum(rs.values.distanceCustom)
      : parseNum(rs.values.distance);
    const mins = parseNum(rs.values.minutes) || 0;
    const secs = parseNum(rs.values.seconds) || 0;
    const duration = Math.round(mins * 60 + secs);
    if (dist === null || dist <= 0 || duration <= 0) return null;
    const values = { distance: Math.round(dist), duration };
    const laps = parseNum(rs.values.laps);
    if (laps !== null && laps > 0) values.laps = Math.round(laps);
    return values;
  }

  if (ex.id === 'rope') {
    const reps = parseNum(rs.values.reps);
    const mins = parseNum(rs.values.minutes) || 0;
    const secs = parseNum(rs.values.seconds) || 0;
    const duration = Math.round(mins * 60 + secs);
    if (reps === null || reps <= 0 || duration <= 0) return null;
    return { reps: Math.round(reps), duration };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* record sheet — open + wire                                          */
/* ------------------------------------------------------------------ */

function openRecordSheet(sportId) {
  const ex = findExercise(sportId) || findExercise('pullup');
  if (!ex) return;
  rs = makeRecordState(ex);

  const api = openSheet({
    title: `${ex.icon || ''} ${exName(ex)}`,
    bodyHtml: recordSheetHtml(),
  });
  wireRecordSheet(api);
}

function redrawSheet(api, focusSelector) {
  api.body.innerHTML = recordSheetHtml();
  if (!focusSelector) return;
  const el = api.body.querySelector(focusSelector);
  if (el && typeof el.focus === 'function') {
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }
}

function syncSave(api) {
  const btn = api.body.querySelector('[data-r-save]');
  if (btn) btn.disabled = !canSave();
}

function wireRecordSheet(api) {
  api.body.addEventListener('click', async (event) => {
    const target = event.target;
    if (!target || !target.closest) return;

    const stageBtn = target.closest('[data-r-stage]');
    if (stageBtn) {
      const n = Number(stageBtn.dataset.rStage);
      const ex = findExercise(rs.sport);
      if (ex && Number.isFinite(n) && n !== rs.stage) {
        prefillStage(rs, ex, n);
        redrawSheet(api, `[data-r-stage="${n}"]`);
      }
      return;
    }

    const grabBtn = target.closest('[data-r-grab]');
    if (grabBtn && rs.flow) {
      rs.flow = recordAttempt(rs.flow, grabBtn.dataset.rGrab === '1');
      redrawSheet(api, isComplete(rs.flow) ? '[data-r-save]' : `[data-r-grab="${grabBtn.dataset.rGrab}"]`);
      return;
    }
    if (target.closest('[data-r-undo]') && rs.flow) {
      rs.flow = undoAttempt(rs.flow);
      redrawSheet(api, '[data-r-grab="1"]');
      return;
    }
    if (target.closest('[data-r-reset]') && rs.flow) {
      rs.flow = resetFlow(rs.flow);
      redrawSheet(api, '[data-r-grab="1"]');
      return;
    }

    const levelBtn = target.closest('[data-r-level]');
    if (levelBtn) {
      const value = Number(levelBtn.dataset.rLevel);
      if (Number.isFinite(value)) {
        rs.values.level = String(value);
        redrawSheet(api, `[data-r-level="${value}"]`);
      }
      return;
    }

    if (target.closest('[data-r-exact]')) {
      rs.showExact = true;
      redrawSheet(api, '[data-r-input][data-key="level"]');
      return;
    }

    const distBtn = target.closest('[data-r-distance]');
    if (distBtn) {
      const ex = findExercise(rs.sport);
      const raw = distBtn.dataset.rDistance;
      if (ex && raw === 'other') {
        rs.otherDistance = true;
        rs.values.distance = '';
        redrawSheet(api, '[data-r-distance="other"]');
      } else if (ex) {
        const m = Number(raw);
        if (Number.isFinite(m)) prefillRun(rs, ex, m);
        redrawSheet(api, `[data-r-distance="${raw}"]`);
      }
      return;
    }

    const stepBtn = target.closest('[data-r-step]');
    if (stepBtn) {
      const key = stepBtn.dataset.key;
      const dir = Number(stepBtn.dataset.dir) || 0;
      const step = Number(stepBtn.dataset.step) || 1;
      const min = Number(stepBtn.dataset.min) || 0;
      const maxAttr = stepBtn.dataset.max;
      const max = maxAttr ? Number(maxAttr) : Infinity;

      let current = parseNum(rs.values[key]);
      if (current === null) current = 0;
      let next = clamp(current + dir * step, min, Number.isFinite(max) ? max : Infinity);
      next = Math.round(next);
      rs.values[key] = String(next);

      const input = api.body.querySelector(`[data-r-input][data-key="${key}"]`);
      if (input) input.value = rs.values[key];
      syncSave(api);
      return;
    }

    if (target.closest('[data-r-changedate]')) {
      rs.showDate = true;
      redrawSheet(api, '[data-r-date]');
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
      rs.values[input.dataset.key] = input.value;
      syncSave(api);
      return;
    }

    const dateInput = target.closest('[data-r-date]');
    if (dateInput) {
      rs.date = dateInput.value || todayStr();
    }
  });

  api.body.addEventListener('change', (event) => {
    const target = event.target;
    if (!target || !target.closest) return;
    const dateInput = target.closest('[data-r-date]');
    if (dateInput) rs.date = dateInput.value || todayStr();
  });
}

async function saveRecord() {
  const ex = findExercise(rs && rs.sport);
  if (!ex) return;
  const values = buildValues(ex);
  if (!values) return;

  const date = rs.date || todayStr();
  const draft = {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    exerciseId: ex.id,
    date,
    createdAt: Date.now(),
    values,
  };

  const previous = entriesFor(state.entries, ex.id);
  const newStamps = newStampsForSave(ex, previous, draft, state.settings.pullup);
  const runCmp = ex.id === 'run' ? runCompareLast(ex, previous.concat([draft])) : null;

  let saved = null;
  try {
    saved = await addEntry(draft);
  } catch {
    saved = null;
  }
  if (!saved) return;

  state.entries = state.entries.concat(saved);
  closeSheet();
  render();

  if (newStamps.length) {
    celebrate(state.celebration);
    vibrate([30, 40, 30]);
    // Show the most meaningful new sticker: goal > personal best > level > stage.
    const rank = { goal: 0, pb: 1, level: 2, stage: 3 };
    const first = newStamps
      .slice()
      .sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9))[0];
    const label = state.lang === 'en' ? first.labelEn || first.label : first.label;
    const value = state.lang === 'en' ? first.valueTextEn || first.valueText : first.valueText;
    toast(`${T('newSticker')} ${first.icon || ''} ${label} ${value}`.replace(/\s+/g, ' ').trim());
  } else if (runCmp && runCmp.fasterBy) {
    toast(formatFaster(runCmp.fasterBy, state.lang));
  }
}

/* ------------------------------------------------------------------ */
/* parent actions                                                      */
/* ------------------------------------------------------------------ */

function onParentStep(key, dir) {
  const cur = state.settings.pullup;
  const next = { ...cur };

  if (key === 'attempts') {
    next.attempts = clamp(cur.attempts + dir, 1, 10);
    next.stage1Grabs = clamp(next.stage1Grabs, 1, next.attempts);
  } else if (key === 'stage1Grabs') {
    next.stage1Grabs = clamp(cur.stage1Grabs + dir, 1, cur.attempts);
  } else if (key === 'stage2Hang') {
    next.stage2Hang = clamp(cur.stage2Hang + dir, 1, 120);
  } else {
    return;
  }

  state.settings.pullup = pullupSettings(next);
  setSetting('pullup', state.settings.pullup);
  renderAndFocus(`[data-parent-step="${key}"][data-dir="${dir}"]`);
}

function onCelebration(kind) {
  if (!kind) return;
  state.celebration = kind;
  setSetting('celebration', kind);
  render();
  celebrate(kind);
}

function onLang(lang) {
  const next = lang === 'en' ? 'en' : 'zh';
  if (next === state.lang) return;
  state.lang = next;
  setSetting('lang', next);
  document.documentElement.lang = next === 'en' ? 'en' : 'zh-CN';
  render();
}

function onToggleUnlock() {
  const next = { ...state.settings.pullup, unlockNext: !state.settings.pullup.unlockNext };
  state.settings.pullup = pullupSettings(next);
  setSetting('pullup', state.settings.pullup);
  renderAndFocus('[data-toggle-unlock]');
}

function onToggleRope() {
  state.showHidden = !state.showHidden;
  setSetting('showHidden', state.showHidden);
  renderAndFocus('[data-toggle-rope]');
}

function applyImportedSettings(settings) {
  if (!settings || typeof settings !== 'object') return;
  if (settings.lang === 'zh' || settings.lang === 'en') {
    state.lang = settings.lang;
    setSetting('lang', settings.lang);
  }
  if (['stars', 'sparkle', 'confetti'].includes(settings.celebration)) {
    state.celebration = settings.celebration;
    setSetting('celebration', settings.celebration);
  }
  if (settings.pullup && typeof settings.pullup === 'object') {
    state.settings.pullup = pullupSettings(settings.pullup);
    setSetting('pullup', state.settings.pullup);
  }
  if (typeof settings.showHidden === 'boolean') {
    state.showHidden = settings.showHidden;
    setSetting('showHidden', settings.showHidden);
  }
  document.documentElement.lang = state.lang === 'en' ? 'en' : 'zh-CN';
}

async function onExportBackup() {
  try {
    const data = await exportBackup({
      lang: state.lang,
      celebration: state.celebration,
      pullup: state.settings.pullup,
      showHidden: state.showHidden,
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `achievement-book-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch {
    /* ignore */
  }
}

async function onImportFile(file) {
  if (!file) return;
  let text = '';
  try {
    text = await file.text();
  } catch {
    toast(T('importFailed'));
    return;
  }
  if (!window.confirm('导入会替换现有记录，继续吗？')) return;

  try {
    const result = await importBackup(text, { mode: 'replace' });
    applyImportedSettings(result.settings);
    state.entries = await getEntries();
    render();
    toast(T('importDone', { n: result.count }));
  } catch {
    toast(T('importFailed'));
  }
}

async function onClearDemo() {
  try {
    const n = await clearDemoEntries();
    state.entries = await getEntries();
    render();
    toast(T('demoCleared', { n }));
  } catch {
    /* ignore */
  }
}

async function onClearAll() {
  if (!window.confirm(L('clearConfirm'))) return;
  try {
    await clearEntries();
  } catch {
    /* ignore */
  }
  state.entries = [];
  render();
}

async function onLoadDemo() {
  try {
    await clearEntries();
    const records = await bulkAddEntries(makeDemoEntries(todayStr()));
    state.entries = Array.isArray(records) && records.length ? records : await getEntries();
  } catch {
    /* ignore */
  }
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

/* ------------------------------------------------------------------ */
/* global wiring                                                       */
/* ------------------------------------------------------------------ */

async function onAppClick(event) {
  const target = event.target;
  if (!target || !target.closest) return;

  const parentStep = target.closest('[data-parent-step]');
  if (parentStep) {
    onParentStep(parentStep.dataset.parentStep, Number(parentStep.dataset.dir) || 0);
    return;
  }

  const celBtn = target.closest('[data-cel]');
  if (celBtn) {
    onCelebration(celBtn.dataset.cel);
    return;
  }

  const langBtn = target.closest('[data-lang]');
  if (langBtn) {
    onLang(langBtn.dataset.lang);
    return;
  }

  if (target.closest('[data-toggle-unlock]')) {
    onToggleUnlock();
    return;
  }

  if (target.closest('[data-toggle-rope]')) {
    onToggleRope();
    return;
  }

  if (target.closest('[data-export]')) {
    await onExportBackup();
    return;
  }

  if (target.closest('[data-import]')) {
    const input = document.querySelector('[data-import-file]');
    if (input) input.click();
    return;
  }

  if (target.closest('[data-clear-demo]')) {
    await onClearDemo();
    return;
  }

  if (target.closest('[data-clear-all]')) {
    await onClearAll();
    return;
  }

  if (target.closest('[data-load-demo]')) {
    await onLoadDemo();
    return;
  }

  const actionEl = target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  if (action === 'open-sport') {
    const id = actionEl.dataset.id;
    if (!findExercise(id)) return;
    state.sportId = id;
    state.view = 'sport';
    render();
    scrollTop();
  } else if (action === 'open-parent') {
    state.view = 'parent';
    render();
    scrollTop();
  } else if (action === 'back') {
    state.view = 'home';
    state.sportId = null;
    render();
    scrollTop();
  } else if (action === 'select-stage') {
    const n = Number(actionEl.dataset.n);
    if (Number.isFinite(n) && state.sportId) {
      state.stageSel[state.sportId] = n;
      renderAndFocus(`[data-action="select-stage"][data-n="${n}"]`);
    }
  } else if (action === 'select-distance') {
    const m = Number(actionEl.dataset.m);
    if (Number.isFinite(m) && state.sportId) {
      state.runSel[state.sportId] = m;
      renderAndFocus(`[data-action="select-distance"][data-m="${m}"]`);
    }
  } else if (action === 'open-record') {
    openRecordSheet(state.sportId);
  } else if (action === 'delete-entry') {
    await removeEntry(actionEl.dataset.id);
  }
}

function wireGlobal() {
  const app = document.getElementById('app');
  if (app) app.addEventListener('click', onAppClick);

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!target || !target.matches) return;
    if (target.matches('[data-import-file]')) {
      const file = target.files && target.files[0] ? target.files[0] : null;
      target.value = '';
      onImportFile(file);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sheet) {
      event.preventDefault();
      closeSheet();
    }
  });
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
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

  state.settings.pullup = pullupSettings(getSetting('pullup', {}));
  state.showHidden = getSetting('showHidden', false) === true;
  document.documentElement.lang = state.lang === 'en' ? 'en' : 'zh-CN';

  wireGlobal();
  render();
}

boot();
