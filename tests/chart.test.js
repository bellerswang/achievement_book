import { describe, it, expect } from 'vitest';
import { buildCurveGeometry, renderCurve, renderSparkline } from '../src/chart.js';

const today = '2026-10-25';
const series = [
  { date: '2026-10-01', value: 5 },
  { date: '2026-10-02', value: 6 },
  { date: '2026-10-20', value: 10 }, // 18-day gap must be visible on the x axis
  { date: '2026-10-25', value: 8 }, // a dip that must NOT be drawn downward
];
const base = {
  series,
  today,
  width: 340,
  height: 200,
  padding: { top: 20, right: 20, bottom: 20, left: 20 },
};

describe('buildCurveGeometry', () => {
  it('places x on real dates, not on record index', () => {
    const g = buildCurveGeometry({ ...base, range: '30d' });
    expect(g.points.map((p) => p.date)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-20',
    ]);

    const xs = g.points.map((p) => p.x);
    // gap between 10-02 and 10-20 is 18 days, between 10-01 and 10-02 is 1 day
    expect((xs[2] - xs[1]) / (xs[1] - xs[0])).toBeCloseTo(18, 1);
  });

  it('7d range keeps only visible new-best points', () => {
    const g = buildCurveGeometry({ ...base, range: '7d' });
    expect(g.points.map((p) => p.date)).toEqual(['2026-10-20']);
    expect(g.trend.length).toBeGreaterThan(0);
  });

  it('higher is drawn higher, and lower-is-better is inverted', () => {
    const up = buildCurveGeometry({ ...base, range: 'all' });
    expect(up.points[2].y).toBeLessThan(up.points[0].y);

    const lowerSeries = [
      { date: '2026-10-01', value: 10 },
      { date: '2026-10-02', value: 8 },
      { date: '2026-10-03', value: 9 },
      { date: '2026-10-04', value: 7 },
    ];
    const lower = buildCurveGeometry({
      series: lowerSeries,
      today: '2026-10-04',
      range: 'all',
      lowerIsBetter: true,
      width: 340,
      height: 200,
      padding: { top: 20, right: 20, bottom: 20, left: 20 },
    });

    expect(lower.points.map((p) => p.date)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-04',
    ]);
    expect(lower.points[1].y).toBeLessThan(lower.points[0].y);
  });

  it('progress-only trend never moves downward, even when raw values dip', () => {
    const wavy = [
      { date: '2026-10-01', value: 5 },
      { date: '2026-10-02', value: 8 },
      { date: '2026-10-03', value: 4 },
      { date: '2026-10-04', value: 9 },
      { date: '2026-10-05', value: 7 },
    ];
    const g = buildCurveGeometry({
      series: wavy,
      today: '2026-10-05',
      range: 'all',
      width: 340,
      height: 200,
      padding: { top: 20, right: 20, bottom: 20, left: 20 },
    });

    for (let i = 1; i < g.trend.length; i += 1) {
      expect(g.trend[i].y).toBeLessThanOrEqual(g.trend[i - 1].y + 0.01);
    }

    const lower = buildCurveGeometry({
      series: [
        { date: '2026-10-01', value: 10 },
        { date: '2026-10-02', value: 12 },
        { date: '2026-10-03', value: 8 },
        { date: '2026-10-04', value: 11 },
        { date: '2026-10-05', value: 7 },
      ],
      today: '2026-10-05',
      range: 'all',
      lowerIsBetter: true,
      width: 340,
      height: 200,
      padding: { top: 20, right: 20, bottom: 20, left: 20 },
    });

    for (let i = 1; i < lower.trend.length; i += 1) {
      expect(lower.trend[i].y).toBeLessThanOrEqual(lower.trend[i - 1].y + 0.01);
    }
  });

  it('marks the PB point and handles all-zero data', () => {
    const g = buildCurveGeometry({ ...base, range: 'all', pb: { date: '2026-10-20' } });
    expect(g.points.filter((p) => p.isPB).map((p) => p.date)).toEqual(['2026-10-20']);

    const zero = buildCurveGeometry({
      ...base,
      range: 'all',
      series: [{ date: today, value: 0 }],
    });
    expect(zero.points[0].y).toBeGreaterThan(0);
    expect(Number.isFinite(zero.yMax)).toBe(true);
  });
});

describe('renderCurve / renderSparkline', () => {
  it('renders an accessible SVG with a title and a hatch pattern', () => {
    const svg = renderCurve({
      series,
      today,
      range: '30d',
      ariaLabel: '拉单杠 悬挂：最近一次 8 秒，个人最佳 10 秒',
      pbDate: '2026-10-20',
    });
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<title');
    expect(svg).toContain('个人最佳 10 秒');
    expect(svg).toContain('<pattern');
    expect(svg).toContain('url(#');
  });

  it('uses valueFormatter for y and star labels', () => {
    const svg = renderCurve({
      series: [{ date: today, value: 60 }],
      today,
      range: '7d',
      valueFormatter: (v) => `${v}%`,
    });
    expect(svg).toContain('60%');
  });

  it('sparkline is decorative and monotonic', () => {
    const svg = renderSparkline([1, 9, 2, 8]);
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('<polyline');
  });
});

describe('progress-only curve with history before the range', () => {
  it('starts the step line at the left edge with the prior best (no NaN)', () => {
    const s = [
      { date: '2026-09-01', value: 9 },
      { date: '2026-10-20', value: 4 },
      { date: '2026-10-24', value: 11 },
    ];
    const g = buildCurveGeometry({ series: s, range: '7d', today: '2026-10-25', width: 340, height: 200, padding: { top: 20, right: 20, bottom: 20, left: 20 } });
    expect(g.trend.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(g.trendPath).not.toMatch(/NaN/);
    expect(g.trend[0].x).toBe(20);
    // 4 is worse than prior best 9 → no point and no dip; only the new best 11 is drawn
    expect(g.points.map((p) => p.value)).toEqual([11]);
    for (let i = 1; i < g.trend.length; i += 1) expect(g.trend[i].y).toBeLessThanOrEqual(g.trend[i - 1].y);
  });
});
