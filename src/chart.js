// SVG chart helpers for 成就本. Pure string output, no DOM mutation.

import { movingAverage, daysBetween, addDays } from './metrics.js';

const PRIMARY = '#0B3D91';
const LABEL = '#333333';

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

/**
 * Pure geometry for the curve chart.
 * x is linear on real dates (gaps stay visible), y is linear on value.
 */
export function buildCurveGeometry(opts = {}) {
  const {
    series = [],
    ma = null,
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

  const list = (Array.isArray(series) ? series : [])
    .filter((p) => p && typeof p.date === 'string' && Number.isFinite(p.value))
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const xEnd = today || (list.length ? list[list.length - 1].date : '');
  let xStart;
  if (range === '7d') xStart = addDays(xEnd, -6);
  else if (range === '30d') xStart = addDays(xEnd, -29);
  else xStart = list.length ? list[0].date : addDays(xEnd, -29);
  if (!xStart) xStart = xEnd;

  const visible = list.filter((p) => p.date >= xStart && p.date <= xEnd);

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

  const rawSpan = daysBetween(xStart, xEnd);
  const spanDays = Number.isFinite(rawSpan) && rawSpan > 0 ? rawSpan : 1;

  const xOf = (date) => {
    const d = daysBetween(xStart, date);
    const safe = Number.isFinite(d) ? d : 0;
    const clamped = Math.max(0, Math.min(spanDays, safe));
    return pad.left + (clamped / spanDays) * plotW;
  };

  const values = visible.map((p) => p.value);
  const maValues =
    Array.isArray(ma) && ma.length === visible.length && ma.every((v) => Number.isFinite(v))
      ? ma
      : movingAverage(values, 7);

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

  const points = visible.map((p) => ({
    x: r2(xOf(p.date)),
    y: r2(yOf(p.value)),
    date: p.date,
    value: p.value,
    isPB: !!(pbDate && p.date === pbDate),
  }));

  const trend = visible.map((p, i) => ({
    x: r2(xOf(p.date)),
    y: r2(yOf(maValues[i])),
  }));

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
    formatValue = (v) => String(v),
    lowerIsBetter = false,
    emptyText = '还没有记录',
  } = opts || {};

  const clean = (Array.isArray(series) ? series : []).filter(
    (p) => p && typeof p.date === 'string' && Number.isFinite(p.value)
  );

  if (!clean.length) {
    if (!emptyText) return '';
    return `<svg class="curve-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(
      emptyText
    )}" style="display:block;width:100%;height:auto">
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="${LABEL}" font-size="16" font-weight="600">${esc(
        emptyText
      )}</text>
    </svg>`;
  }

  const geo = buildCurveGeometry({
    series: clean,
    pb: pbDate ? { date: pbDate } : null,
    range,
    today,
    width,
    height,
    lowerIsBetter,
  });

  const pad = geo.padding;
  const bottomY = height - pad.bottom;
  const topValue = lowerIsBetter ? geo.yMin : geo.yMax;
  const title = ariaLabel || `${metricLabel} ${unit}`.trim();

  const parts = [];
  parts.push(
    `<svg class="curve-svg" viewBox="0 0 ${width} ${height}" role="img" style="display:block;width:100%;height:auto">`
  );
  parts.push(`<title>${esc(title)}</title>`);

  if (geo.areaPath) {
    parts.push(
      `<path class="curve-area${animate ? ' fade-in' : ''}" d="${geo.areaPath}" fill="${PRIMARY}" fill-opacity="0.18" stroke="none" />`
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
    )}" stroke="${LABEL}" stroke-width="1.5" />`
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
      formatValue(topValue)
    )}</text>`
  );

  const pbPoint = geo.points.find((p) => p.isPB) || null;

  for (const pt of geo.points) {
    if (pt.isPB) continue;
    const isHi = !!(highlightDate && pt.date === highlightDate);
    parts.push(
      `<circle class="pt${isHi ? ' pt-new' : ''}" cx="${pt.x}" cy="${pt.y}" r="4" fill="#FFFFFF" stroke="${PRIMARY}" stroke-width="2" />`
    );
  }

  if (pbPoint) {
    const isHi = !!(highlightDate && pbPoint.date === highlightDate);
    parts.push(
      `<circle class="pt pb${isHi ? ' pt-new' : ''}" cx="${pbPoint.x}" cy="${pbPoint.y}" r="9" fill="${PRIMARY}" stroke="#FFFFFF" stroke-width="3" />`
    );
    parts.push(
      `<text x="${pbPoint.x}" y="${r2(pbPoint.y - 16)}" text-anchor="middle" fill="${PRIMARY}" font-size="14" font-weight="700">★ ${esc(
        formatValue(pbPoint.value)
      )}</text>`
    );
  }

  parts.push('</svg>');
  return parts.join('');
}

/**
 * Small decorative sparkline. Always aria-hidden.
 */
export function renderSparkline(values, opts = {}) {
  const width = Number.isFinite(opts.width) ? opts.width : 96;
  const height = Number.isFinite(opts.height) ? opts.height : 32;
  const nums = (Array.isArray(values) ? values : []).filter((v) => Number.isFinite(v));

  if (!nums.length) {
    return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false"></svg>`;
  }

  const pad = 4;
  const mn = Math.min(...nums);
  const mx = Math.max(...nums);
  const span = mx - mn;
  const n = nums.length;

  const pts = nums.map((v, i) => {
    const x = n === 1 ? width / 2 : pad + (i / (n - 1)) * (width - pad * 2);
    const y = span === 0 ? height / 2 : height - pad - ((v - mn) / span) * (height - pad * 2);
    return [r2(x), r2(y)];
  });

  const poly = pts.map((p) => `${p[0]},${p[1]}`).join(' ');
  const last = pts[pts.length - 1];

  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">
    <polyline points="${poly}" fill="none" stroke="${PRIMARY}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="${PRIMARY}" />
  </svg>`;
}
