import { addDays, parseKey } from './dates';
import { TryItem } from './types';

/** 開始日から数えて何日目か（開始日=1日目） */
export function dayIndex(start: string, today: string): number {
  const ms = parseKey(today).getTime() - parseKey(start).getTime();
  return Math.round(ms / 86400000) + 1;
}

export function trialEnd(item: TryItem): string | null {
  return item.trialStart ? addDays(item.trialStart, item.trialDays - 1) : null;
}

/** おためし期間中にやった日数 */
export function trialDone(item: TryItem): number {
  if (!item.trialStart) return 0;
  const end = trialEnd(item) as string;
  let n = 0;
  item.checks.forEach((d) => {
    if (d >= (item.trialStart as string) && d <= end) n++;
  });
  return n;
}

/** おためし期間が終わって、ふりかえりを待っている */
export function isTrialOver(item: TryItem, today: string): boolean {
  const end = trialEnd(item);
  return item.status === 'trying' && end !== null && today > end;
}

/** 連続日数（今日まだなら昨日から数える） */
export function streak(checks: Set<string>, today: string): number {
  let cur = checks.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (checks.has(cur)) {
    n++;
    cur = addDays(cur, -1);
  }
  return n;
}

/** 直近30日（習慣にした日以降）の達成率 */
export function recentRate(item: TryItem, today: string): { done: number; total: number; rate: number } {
  const start = item.habitStart ?? today;
  let total = 0;
  let done = 0;
  for (let i = 0; i < 30; i++) {
    const d = addDays(today, -i);
    if (d < start) break;
    total++;
    if (item.checks.has(d)) done++;
  }
  return { done, total, rate: total ? Math.round((done / total) * 100) : 0 };
}

/** はじめて試した日（古いデータは firstTrialStart が無いので trialStart で代用） */
export function firstTriedOn(item: TryItem): string | null {
  return item.firstTrialStart ?? item.trialStart;
}

export interface PeriodStats {
  from: string;
  to: string;
  /** その期間に初めて試し始めたこと */
  started: number;
  /** 何か1つでも「やった」がある日数 */
  activeDays: number;
  /** 「やった」の合計 */
  checks: number;
}

export interface Ayumi {
  /** いちばん最初に試した日 */
  origin: string;
  /** 最初に試した日から今日まで何日目か */
  dayCount: number;
  /** 比べる期間の長さ（日）。比べるには早いときは null */
  span: number | null;
  first: PeriodStats | null;
  recent: PeriodStats | null;
}

/** 比べられるようになるまでの日数 */
export const AYUMI_MIN_DAYS = 14;

function periodStats(items: TryItem[], from: string, to: string): PeriodStats {
  const active = new Set<string>();
  let checks = 0;
  let started = 0;
  items.forEach((item) => {
    const first = firstTriedOn(item);
    if (first && first >= from && first <= to) started++;
    item.checks.forEach((d) => {
      if (d >= from && d <= to) {
        active.add(d);
        checks++;
      }
    });
  });
  return { from, to, started, activeDays: active.size, checks };
}

/** 「はじめのころ」と「いま」を同じ長さ（最大30日・重ならない）で比べる */
export function ayumi(items: TryItem[], today: string): Ayumi | null {
  const tried = items.filter((i) => firstTriedOn(i));
  if (!tried.length) return null;
  const origin = tried.map((i) => firstTriedOn(i) as string).sort()[0];
  const dayCount = Math.max(dayIndex(origin, today), 1);
  if (dayCount < AYUMI_MIN_DAYS) return { origin, dayCount, span: null, first: null, recent: null };
  const span = Math.min(30, Math.floor(dayCount / 2));
  return {
    origin,
    dayCount,
    span,
    first: periodStats(tried, origin, addDays(origin, span - 1)),
    recent: periodStats(tried, addDays(today, -(span - 1)), today),
  };
}
