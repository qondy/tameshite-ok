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
