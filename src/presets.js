// Preset exercises for 成就本 (Achievement Book).
// Every preset uses the single brand color; order matters (pull-up FIRST).

export const PRIMARY_COLOR = '#0B3D91';

export const PRESET_EXERCISES = [
  {
    id: 'pullup',
    name: '拉单杠',
    nameEn: 'Pull-ups',
    icon: '🧗',
    color: '#0B3D91',
    order: 0,
    aggregation: 'max',
    weekly: { metric: null, mode: 'count' },
    metrics: [
      {
        key: 'hang',
        label: '悬挂',
        labelEn: 'Hang',
        unit: '秒',
        unitEn: 's',
        inputType: 'int',
        primary: true,
        higherIsBetter: true,
        input: true,
        step: 1,
      },
      {
        key: 'reps',
        label: '次数',
        labelEn: 'Reps',
        unit: '次',
        unitEn: 'reps',
        inputType: 'int',
        primary: true,
        higherIsBetter: true,
        input: true,
        step: 1,
      },
      {
        key: 'sets',
        label: '组数',
        labelEn: 'Sets',
        unit: '组',
        unitEn: 'sets',
        inputType: 'int',
        primary: false,
        higherIsBetter: true,
        input: true,
        step: 1,
      },
    ],
    chartMetrics: ['hang', 'reps'],
    defaultChartMetric: 'hang',
  },
  {
    id: 'run',
    name: '跑步',
    nameEn: 'Running',
    icon: '🏃',
    color: '#0B3D91',
    order: 1,
    aggregation: 'sum',
    weekly: { metric: 'distance', mode: 'sum' },
    metrics: [
      {
        key: 'distance',
        label: '距离',
        labelEn: 'Distance',
        unit: '公里',
        unitEn: 'km',
        inputType: 'decimal',
        primary: true,
        higherIsBetter: true,
        input: true,
        step: 0.1,
      },
      {
        key: 'duration',
        label: '时长',
        labelEn: 'Time',
        unit: '分钟',
        unitEn: 'min',
        inputType: 'decimal',
        primary: false,
        higherIsBetter: true,
        input: true,
        step: 0.1,
      },
      {
        key: 'pace',
        label: '配速',
        labelEn: 'Pace',
        unit: '分钟/公里',
        unitEn: 'min/km',
        inputType: 'decimal',
        primary: false,
        higherIsBetter: false,
        derived: true,
        input: false,
        step: 0.1,
      },
    ],
    chartMetrics: ['distance', 'pace'],
    defaultChartMetric: 'distance',
  },
  {
    id: 'rope',
    name: '跳绳',
    nameEn: 'Jump rope',
    icon: '🪢',
    color: '#0B3D91',
    order: 2,
    aggregation: 'max',
    weekly: { metric: 'reps', mode: 'sum' },
    metrics: [
      {
        key: 'reps',
        label: '次数',
        labelEn: 'Reps',
        unit: '次',
        unitEn: 'reps',
        inputType: 'int',
        primary: true,
        higherIsBetter: true,
        input: true,
        step: 1,
      },
      {
        key: 'duration',
        label: '时长',
        labelEn: 'Time',
        unit: '秒',
        unitEn: 's',
        inputType: 'int',
        primary: false,
        higherIsBetter: true,
        input: true,
        step: 1,
      },
    ],
    chartMetrics: ['reps'],
    defaultChartMetric: 'reps',
  },
];

/**
 * Look up a metric definition on an exercise.
 * @param {object} exercise
 * @param {string} key
 * @returns {object|null}
 */
export function getMetric(exercise, key) {
  if (!exercise || !Array.isArray(exercise.metrics)) return null;
  return exercise.metrics.find((m) => m && m.key === key) || null;
}
