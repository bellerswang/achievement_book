// SVG chart helpers for 成就本. Pure string output, no DOM mutation.

import { addDays, daysBetween, bestBefore, bestSoFarSeries } from './metrics.js';

const PRIMARY = '#0B3D91';
const INK = '#111111';
const LABEL = '#333333';

let chartSeq = 0;

function esc(value) {
  return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, (c) => {
    if (c === '&') return '&amp;';
    if (c === '<') return '&lt;';
    if (c === '>') return '&gt;';
    if (c === '"') return '&quot;';
    return '&#39;';
  });
}

function r2(n) {
  return Math.round(n * 100) / 100;
}

function md(dateStr) {
  const parts = String(dateStr || '').split('-');
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(m) || !Number.isFinite(d)) return String(dateStr || '');
  return `${m}/${d}`;
}

function emptyCurveSvg(width, height, text) {
  if (!text) return '';
  return `<svg class="curve-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(
    text
  )}" style="display:block;width:100%;height:auto">
    <text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="${LABEL}" font-size="16" font-weight="600">${esc(
      text
    )}</text>
  </svg>`;
}

/**
 * Pure geometry for the progress-only curve chart.
 *
 * The visible daily series is transformed with bestSoFarSeries(), so the line
 * can only move toward "better". Points are only emitted for days that set a
 * new best. The trend is a step line: horizontal first, then vertical up.
 *
 * x is linear on REAL dates (gaps stay visible), y is linear on value.
 * Higher/better is drawn higher; lower-is-better is inverted so improvement
 * still goes UP.
 */
export function buildCurveGeometry(opts = {}) {
  const {
    series = [],
    pb = null,
    range = '30d',
    today,
    width = 340,
    height = 200,
    padding,
    lowerIsBetter = false,
  } = opts || {};

  const pad = {
    top: 34,
    right: 16,
    bottom: 30,
    left: 16,
    ...(padding && typeof padding === 'object' ? padding : {}),
  };

  const plotW = Math.max(10, width - pad.left - pad.right);
  const plotH = Math.max(10, height - pad.top - pad.bottom);
  const bottomY = pad.top + plotH;

  const raw = (Array.isArray(series) ? series : [])
    .filter((p) => p && typeof p.date === 'string' && Number.isFinite(p.value))
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const xEnd = today || (raw.length ? raw[raw.length - 1].date : '');
  let xStart;
  if (range === '7d') xStart = addDays(xEnd, -6);
  else if (range === '30d') xStart = addDays(xEnd, -29);
  else xStart = raw.length ? raw[0].date : addDays(xEnd, -29);
  if (!xStart) xStart = xEnd;

  const visible = raw.filter((p) => p.date >= xStart && p.date <= xEnd);

  if (!visible.length) {
    return {
      points: [],
      trend: [],
      areaPath: '',
      trendPath: '',
      yMin: 0,
      yMax: 1,
      xStart,
      xEnd,
      width,
      height,
      padding: pad,
    };
  }

  const firstVisibleDate = visible[0].date;
  const priorBest = bestBefore(raw, firstVisibleDate, lowerIsBetter);
  const best = bestSoFarSeries(visible, { lowerIsBetter, priorBest });

  const rawSpan = daysBetween(xStart, xEnd);
  const spanDays = Number.isFinite(rawSpan) && rawSpan > 0 ? rawSpan : 1;

  const xOf = (date) => {
    const d = daysBetween(xStart, date);
    const safe = Number.isFinite(d) ? d : 0;
    const clamped = Math.max(0, Math.min(spanDays, safe));
    return pad.left + (clamped / spanDays) * plotW;
  };

  const values = best.map((p) => p.value);
  if (typeof priorBest === 'number' && Number.isFinite(priorBest)) values.push(priorBest);

  const mn = Math.min(...values);
  const mx = Math.max(...values);

  let yMin;
  let yMax;
  if (lowerIsBetter) {
    yMin = mn * 0.9;
    yMax = mx * 1.1;
  } else {
    yMin = 0;
    yMax = mx * 1.1;
  }

  if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMax <= yMin) {
    yMin = 0;
    yMax = Math.max(1, Number.isFinite(mx) ? mx : 1);
  }
  if (yMax <= yMin) yMax = yMin + 1;

  const yOf = (value) => {
    const ratio = (value - yMin) / (yMax - yMin);
    const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
    return lowerIsBetter ? pad.top + clamped * plotH : pad.top + (1 - clamped) * plotH;
  };

  const pbDate = pb && typeof pb === 'object' ? pb.date : typeof pb === 'string' ? pb : null;

  const newBests = best
    .map((p) => ({
      x: r2(xOf(p.date)),
      y: r2(yOf(p.value)),
      date: p.date,
      value: p.value,
      isNewBest: !!p.isNewBest,
    }))
    .filter((p) => p.isNewBest);

  let pbIndex = -1;
  if (pbDate) {
    pbIndex = newBests.findIndex((p) => p.date === pbDate);
  }
  if (pbIndex < 0 && newBests.length) pbIndex = newBests.length - 1;

  const points = newBests.map((p, i) => ({
    x: p.x,
    y: p.y,
    date: p.date,
    value: p.value,
    isPB: i === pbIndex,
  }));

  const trend = [];
  let prevX = null;
  let prevY = null;

  if (typeof priorBest === 'number' && Number.isFinite(priorBest)) {
    prevX = pad.left; // left edge of the plot (pixel x, not the date)
    prevY = yOf(priorBest);
    trend.push({ x: r2(prevX), y: r2(prevY) });
  }

  for (const p of best) {
    const x = xOf(p.date);
    const y = yOf(p.value);

    if (prevX === null || prevY === null) {
      prevX = x;
      prevY = y;
      trend.push({ x: r2(prevX), y: r2(prevY) });
      continue;
    }

    if (x > prevX + 0.01) {
      trend.push({ x: r2(x), y: r2(prevY) });
    }
    if (Math.abs(y - prevY) > 0.01) {
      trend.push({ x: r2(x), y: r2(y) });
    }
    prevX = x;
    prevY = y;
  }

  const xEndPx = xOf(xEnd);
  if (prevX !== null && prevY !== null && xEndPx > prevX + 0.01) {
    trend.push({ x: r2(xEndPx), y: r2(prevY) });
  }

  let trendPath = '';
  if (trend.length) {
    trendPath = trend.map((t, i) => `${i === 0 ? 'M' : 'L'} ${t.x} ${t.y}`).join(' ');
  }

  let areaPath = '';
  if (trend.length) {
    const base = r2(bottomY);
    const body = trend.map((t) => `L ${t.x} ${t.y}`).join(' ');
    areaPath = `M ${trend[0].x} ${base} ${body} L ${trend[trend.length - 1].x} ${base} Z`;
  }

  return {
    points,
    trend,
    areaPath,
    trendPath,
    yMin: r2(yMin),
    yMax: r2(yMax),
    xStart,
    xEnd,
    width,
    height,
    padding: pad,
  };
}

/**
 * Render the main curve SVG string.
 *
 * May only sees the best-so-far step line, so the chart never moves down.
 */
export function renderCurve(opts = {}) {
  const {
    series = [],
    metricLabel = '',
    unit = '',
    range = '30d',
    today,
    width = 340,
    height = 200,
    pbDate = null,
    highlightDate = null,
    animate = false,
    ariaLabel = '',
    valueFormatter,
    formatValue: legacyFormatter,
    lowerIsBetter = false,
    emptyText = '还没有记录',
  } = opts || {};

  const fmt =
    typeof valueFormatter === 'function'
      ? valueFormatter
      : typeof legacyFormatter === 'function'
      ? legacyFormatter
      : (v) => String(v);

  const clean = (Array.isArray(series) ? series : []).filter(
    (p) => p && typeof p.date === 'string' && Number.isFinite(p.value)
  );

  if (!clean.length) return emptyCurveSvg(width, height, emptyText);

  const geo = buildCurveGeometry({
    series: clean,
    pb: pbDate ? { date: pbDate } : null,
    range,
    today,
    width,
    height,
    lowerIsBetter,
  });

  if (!geo.trend.length) return emptyCurveSvg(width, height, emptyText);

  const pad = geo.padding;
  const bottomY = height - pad.bottom;
  const topValue = lowerIsBetter ? geo.yMin : geo.yMax;
  const title = ariaLabel || `${metricLabel} ${unit}`.trim();
  const hatchId = `habit-hatch-${++chartSeq}`;

  const parts = [];
  parts.push(
    `<svg class="curve-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(
      title
    )}" style="display:block;width:100%;height:auto">`
  );
  parts.push(`<title>${esc(title)}</title>`);
  parts.push(
    `<defs><pattern id="${hatchId}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="${PRIMARY}" stroke-width="2" /></pattern></defs>`
  );

  if (geo.areaPath) {
    parts.push(
      `<path class="curve-area${animate ? ' fade-in' : ''}" d="${geo.areaPath}" fill="url(#${hatchId})" stroke="none" />`
    );
  }

  if (geo.trendPath) {
    parts.push(
      `<path class="curve-line${animate ? ' draw' : ''}" d="${geo.trendPath}" fill="none" stroke="${PRIMARY}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" />`
    );
  }

  parts.push(
    `<line x1="${pad.left}" y1="${r2(bottomY)}" x2="${width - pad.right}" y2="${r2(
      bottomY
    )}" stroke="${INK}" stroke-width="2" />`
  );

  parts.push(
    `<text x="${pad.left}" y="${height - 8}" fill="${LABEL}" font-size="14" font-weight="600" text-anchor="start">${esc(
      md(geo.xStart)
    )}</text>`
  );
  parts.push(
    `<text x="${width - pad.right}" y="${height - 8}" fill="${LABEL}" font-size="14" font-weight="600" text-anchor="end">${esc(
      md(geo.xEnd)
    )}</text>`
  );
  parts.push(
    `<text x="${pad.left}" y="${pad.top - 14}" fill="${LABEL}" font-size="14" font-weight="600" text-anchor="start">${esc(
      fmt(topValue)
    )}</text>`
  );

  const pbPoint = geo.points.find((p) => p.isPB) || null;

  for (const pt of geo.points) {
    if (pt.isPB) continue;
    const isHi = !!(highlightDate && pt.date === highlightDate);
    parts.push(
      `<circle class="pt${isHi ? ' pt-new' : ''}" cx="${pt.x}" cy="${pt.y}" r="4" fill="#FFFFFF" stroke="${PRIMARY}" stroke-width="2.5" />`
    );
  }

  if (pbPoint) {
    const isHi = !!(highlightDate && pbPoint.date === highlightDate);
    parts.push(
      `<circle class="pt pb${isHi ? ' pt-new' : ''}" cx="${pbPoint.x}" cy="${pbPoint.y}" r="9" fill="${PRIMARY}" stroke="#FFFFFF" stroke-width="3" />`
    );
    parts.push(
      `<text x="${pbPoint.x}" y="${r2(pbPoint.y - 16)}" text-anchor="middle" fill="${PRIMARY}" font-size="14" font-weight="700">★ ${esc(
        fmt(pbPoint.value)
      )}</text>`
    );
  }

  parts.push('</svg>');
  return parts.join('');
}

/**
 * Small decorative sparkline. Always aria-hidden.
 * Values are made monotonic first so the line never moves down.
 */
export function renderSparkline(values, opts = {}) {
  const width = Number.isFinite(opts.width) ? opts.width : 96;
  const height = Number.isFinite(opts.height) ? opts.height : 32;
  const lowerIsBetter = !!opts.lowerIsBetter;

  const raw = (Array.isArray(values) ? values : []).filter((v) => Number.isFinite(v));
  if (!raw.length) {
    return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false"></svg>`;
  }

  const nums = [];
  let best = null;
  for (const v of raw) {
    if (best === null) best = v;
    else best = lowerIsBetter ? Math.min(best, v) : Math.max(best, v);
    nums.push(best);
  }

  const pad = 4;
  const mn = Math.min(...nums);
  const mx = Math.max(...nums);
  const span = mx - mn;
  const n = nums.length;

  const pts = nums.map((v, i) => {
    const x = n === 1 ? width / 2 : pad + (i / (n - 1)) * (width - pad * 2);
    let y;
    if (span === 0) {
      y = height / 2;
    } else if (lowerIsBetter) {
      y = pad + ((v - mn) / span) * (height - pad * 2);
    } else {
      y = height - pad - ((v - mn) / span) * (height - pad * 2);
    }
    return [r2(x), r2(y)];
  });

  const poly = pts.map((p) => `${p[0]},${p[1]}`).join(' ');
  const last = pts[pts.length - 1];

  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">
    <polyline points="${poly}" fill="none" stroke="${PRIMARY}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="${PRIMARY}" />
  </svg>`;
}
