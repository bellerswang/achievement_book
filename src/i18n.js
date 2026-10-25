// Tiny i18n table for 成就本. `t(key, lang, params)` never throws.

export const STRINGS = {
  zh: {
    tabSports: '运动',
    tabAchievements: '成就',
    thisWeek: '本周',
    attemptsUnit: '次练习',
    record: '记录',
    save: '保存',
    today: '今天',
    date: '日期',
    personalBest: '个人最佳',
    cumulative: '累计',
    streak: '连续',
    days: '天',
    vsLast: '较上次',
    vsLastMonth: '较上月',
    bestThisMonth: '本月最佳',
    bestRecent: '最近一次最佳',
    triesToday: '今天试了 {n} 次',
    newRecord: '新纪录！',
    range7: '7天',
    range30: '30天',
    rangeAll: '全部',
    achievementsSoon: '成就即将上线',
    settings: '设置',
    celebration: '庆祝效果',
    stars: '星星',
    sparkle: '闪光',
    confetti: '彩纸',
    language: '语言',
    demoData: '演示数据（开发）',
    loadDemo: '载入演示数据',
    clearData: '清空数据',
    noData: '还没有记录，点 ＋ 开始',
    milestone: '累计达到 {n}',
    nextMilestone: '下一个目标 {n}',
    chooseExercise: '选择运动',
    close: '关闭',
    addRecord: '添加记录',
    back: '返回',
    chartAria: '{name}：最近一次 {latest}，个人最佳 {pb}',
    up: '上升',
    delete: '删除',
  },
  en: {
    tabSports: 'Sports',
    tabAchievements: 'Achievements',
    thisWeek: 'This week',
    attemptsUnit: 'tries',
    record: 'Records',
    save: 'Save',
    today: 'Today',
    date: 'Date',
    personalBest: 'Personal best',
    cumulative: 'Total',
    streak: 'Streak',
    days: 'days',
    vsLast: 'vs last',
    vsLastMonth: 'vs last month',
    bestThisMonth: 'Best this month',
    bestRecent: 'Recent best',
    triesToday: '{n} tries today',
    newRecord: 'New record!',
    range7: '7d',
    range30: '30d',
    rangeAll: 'All',
    achievementsSoon: 'Achievements coming soon',
    settings: 'Settings',
    celebration: 'Celebration',
    stars: 'Stars',
    sparkle: 'Sparkle',
    confetti: 'Confetti',
    language: 'Language',
    demoData: 'Demo data (dev)',
    loadDemo: 'Load demo data',
    clearData: 'Clear data',
    noData: 'No records yet, tap ＋',
    milestone: 'Reached {n} total',
    nextMilestone: 'Next goal {n}',
    chooseExercise: 'Choose sport',
    close: 'Close',
    addRecord: 'Add record',
    back: 'Back',
    chartAria: '{name}: latest {latest}, personal best {pb}',
    up: 'up',
    delete: 'Delete',
  },
};

/**
 * Translate a key. Missing params are left as-is (`{n}` stays `{n}`).
 * @param {string} key
 * @param {string} lang 'zh' | 'en'
 * @param {Record<string, unknown>} [params]
 * @returns {string}
 */
export function t(key, lang, params) {
  const table = STRINGS[lang] || STRINGS.zh;
  let str = table[key];
  if (str === undefined) str = STRINGS.zh[key];
  if (str === undefined) return String(key);
  if (!params) return str;

  return str.replace(/\{(\w+)\}/g, (match, name) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) return match;
    const value = params[name];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}
