import {
  collection, doc, onSnapshot, setDoc, addDoc, deleteDoc, deleteField, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { TryItem, TryStatus, Verdict } from './types';

const STATUSES: TryStatus[] = ['idea', 'trying', 'judged', 'habit'];
const VERDICTS: Verdict[] = ['good', 'meh', 'bad'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const dateOrNull = (v: unknown): string | null => (typeof v === 'string' && DATE_RE.test(v) ? v : null);

const triesCol = (uid: string) => collection(db, 'users', uid, 'tries');
const tryDoc = (uid: string, id: string) => doc(db, 'users', uid, 'tries', id);

export function subscribeTries(
  uid: string,
  onData: (items: TryItem[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(triesCol(uid), (snap) => {
    const list: TryItem[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (typeof data.title !== 'string') return;
      const checks = new Set<string>();
      if (data.checks && typeof data.checks === 'object') {
        Object.entries(data.checks as Record<string, unknown>).forEach(([k, v]) => {
          if (v === true && DATE_RE.test(k)) checks.add(k);
        });
      }
      const created = data.createdAt && typeof data.createdAt.toMillis === 'function'
        ? data.createdAt.toMillis() : Date.now();
      list.push({
        id: d.id,
        title: data.title,
        mini: str(data.mini),
        memo: str(data.memo),
        status: STATUSES.includes(data.status) ? data.status : 'idea',
        trialDays: typeof data.trialDays === 'number' && data.trialDays > 0 ? Math.floor(data.trialDays) : 7,
        trialStart: dateOrNull(data.trialStart),
        habitStart: dateOrNull(data.habitStart),
        checks,
        verdict: VERDICTS.includes(data.verdict) ? data.verdict : null,
        verdictNote: str(data.verdictNote),
        rounds: typeof data.rounds === 'number' && data.rounds > 0 ? Math.floor(data.rounds) : 0,
        createdAt: created,
      });
    });
    list.sort((a, b) => b.createdAt - a.createdAt);
    onData(list);
  }, onError);
}

export interface IdeaInput {
  title: string;
  mini: string;
  memo: string;
}

export async function createIdea(uid: string, input: IdeaInput): Promise<void> {
  await addDoc(triesCol(uid), {
    ...input,
    status: 'idea',
    trialDays: 7,
    rounds: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function updateIdea(uid: string, id: string, input: IdeaInput): Promise<void> {
  return setDoc(tryDoc(uid, id), { ...input, updatedAt: serverTimestamp() }, { merge: true });
}

/** おためしを始める（もう一度試す場合も同じ。前回のチェックは残すが期間の判定は開始日以降のみ） */
export function startTrial(uid: string, id: string, days: number, start: string, rounds: number): Promise<void> {
  return setDoc(tryDoc(uid, id), {
    status: 'trying',
    trialDays: days,
    trialStart: start,
    verdict: deleteField(),
    verdictNote: deleteField(),
    rounds: rounds + 1,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function setCheck(uid: string, id: string, date: string, on: boolean): Promise<void> {
  return setDoc(tryDoc(uid, id), {
    checks: { [date]: on ? true : deleteField() },
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function judge(uid: string, id: string, verdict: Verdict, note: string, toHabit: boolean, today: string): Promise<void> {
  return setDoc(tryDoc(uid, id), {
    status: toHabit ? 'habit' : 'judged',
    verdict,
    verdictNote: note,
    habitStart: toHabit ? today : deleteField(),
    judgedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function promoteToHabit(uid: string, id: string, today: string): Promise<void> {
  return setDoc(tryDoc(uid, id), {
    status: 'habit',
    habitStart: today,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/** 習慣をおやすみする（記録は残したまま「きろく」へ） */
export function restHabit(uid: string, id: string): Promise<void> {
  return setDoc(tryDoc(uid, id), { status: 'judged', updatedAt: serverTimestamp() }, { merge: true });
}

export function deleteTry(uid: string, id: string): Promise<void> {
  return deleteDoc(tryDoc(uid, id));
}
