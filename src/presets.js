// Preset exercises for 成就本 (Achievement Book).
// Every preset uses the single brand color; order matters (pull-up FIRST).

export const PRIMARY_COLOR = '#0B3D91';

export const PULLUP_DEFAULTS = {
  attempts: 5,
  stage1Grabs: 4,
  stage2Hang: 10,
};

export const LEVEL_OPTIONS = [
  { value: 25, label: '手臂微弯', labelEn: 'Arms a little bent' },
  { value: 50, label: '拉到一半', labelEn: 'Halfway up' },
  { value: 75, label: '快到杠了', labelEn: 'Almost there' },
  { value: 100, label: '下巴过杠', labelEn: 'Chin over bar' },
];

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
        key: 'grabs',
        label: '抓住',
        labelEn: 'Grabs',
        unit: '次',
        unitEn: 'grabs',
        inputType: 'int',
        primary: true,
        higherIsBetter: true,
        input: true,
        step: 1,
      },
      {
        key: 'attempts',
        label: '尝试',
        labelEn: 'Tries',
        unit: '次',
        unitEn: 'tries',
        inputType: 'int',
        primary: false,
        higherIsBetter: true,
        input: true,
        step: 1,
      },
      {
        key: 'grabRate',
        label: '成功率',
        labelEn: 'Success rate',
        unit: '%',
        unitEn: '%',
        inputType: 'int',
        primary: true,
        higherIsBetter: true,
        derived: true,
        input: false,
        step: 1,
      },
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
        key: 'level',
        label: '高度',
        labelEn: 'Height',
        unit: '%',
        unitEn: '%',
        inputType: 'int',
        primary: true,
        higherIsBetter: true,
        input: true,
        step: 1,
        // Free 0–100 input judged by a parent; these are quick-fill presets.
        options: [25, 50, 75, 100],
        min: 0,
        max: 100,
      },
    ],
    stages: [
      {
        n: 1,
        id: 'grab',
        name: '抓杠',
        nameEn: 'Grab the bar',
        icon: '✋',
        metric: 'grabRate',
        inputs: ['grabs', 'attempts'],
      },
      {
        n: 2,
        id: 'hang',
        name: '悬挂',
        nameEn: 'Hang',
        icon: '⏱️',
        metric: 'hang',
        inputs: ['hang'],
      },
      {
        n: 3,
        id: 'pull',
        name: '引体向上',
        nameEn: 'Pull up',
        icon: '💪',
        metric: 'level',
        inputs: ['level'],
      },
    ],
    chartMetrics: ['grabRate', 'hang', 'level'],
    defaultChartMetric: 'grabRate',
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
        options: [0.5, 1, 2, 3, 5],
      },
      {
        key: 'duration',
        label: '用时',
        labelEn: 'Time',
        unit: '秒',
        unitEn: 's',
        inputType: 'int',
        primary: false,
        higherIsBetter: false,
        input: true,
        step: 1,
      },
    ],
    chartMetrics: ['distance', 'duration'],
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
