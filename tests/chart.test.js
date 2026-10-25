import { describe, it, expect } from 'vitest';
import { buildCurveGeometry, renderCurve, renderSparkline } from '../src/chart.js';

const today = '2026-10-25';
const series = [
  { date: '2026-10-01', value: 5 },
  { date: '2026-10-02', value: 6 },
  { date: '2026-10-20', value: 10 }, // 18-day gap must be visible on the x axis
  { date: '2026-10-25', value: 8 },
];
const base = { series, today, width: 340, height: 200, padding: { top: 20, right: 20, bottom: 20, left: 20 } };

describe('buildCurveGeometry', () => {
  it('places x on real dates, not on record index', () => {
    const g = buildCurveGeometry({ ...base, range: '30d' });
    const xs = g.points.map((p) => p.x);
    // gap between 10-02 and 10-20 is 18 days, between 10-01 and 10-02 is 1 day
    expect((xs[2] - xs[1]) / (xs[1] - xs[0])).toBeCloseTo(18, 1);
    expect(g.points.at(-1).x).toBeCloseTo(320, 1); // today = right edge
  });

  it('7d range keeps only the last 7 days', () => {
    const g = buildCurveGeometry({ ...base, range: '7d' });
    expect(g.points.map((p) => p.date)).toEqual(['2026-10-20', '2026-10-25']);
  });

  it('higher is drawn higher (smaller y), and inverted for lower-is-better metrics', () => {
    const up = buildCurveGeometry({ ...base, range: 'all' });
    expect(up.points[2].y).toBeLessThan(up.points[0].y);
    const pace = buildCurveGeometry({ ...base, range: 'all', lowerIsBetter: true });
    expect(pace.points[2].y).toBeGreaterThan(pace.points[0].y);
  });

  it('marks the PB point and handles all-zero data', () => {
    const g = buildCurveGeometry({ ...base, range: 'all', pb: { date: '2026-10-20' } });
    expect(g.points.filter((p) => p.isPB).map((p) => p.date)).toEqual(['2026-10-20']);
    const zero = buildCurveGeometry({ ...base, range: 'all', series: [{ date: today, value: 0 }] });
    expect(zero.points[0].y).toBeGreaterThan(0);
    expect(Number.isFinite(zero.yMax)).toBe(true);
  });
});

describe('renderCurve / renderSparkline', () => {
  it('renders an accessible SVG with a title', () => {
    const svg = renderCurve({ series, today, range: '30d', ariaLabel: '拉单杠 悬挂：最近一次 8 秒，个人最佳 10 秒', pbDate: '2026-10-20' });
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<title');
    expect(svg).toContain('个人最佳 10 秒');
  });
  it('sparkline is decorative', () => {
    expect(renderSparkline([1, 2, 3])).toContain('aria-hidden="true"');
  });
});
