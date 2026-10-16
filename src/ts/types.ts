/** idea=やってみたい / trying=おためし中 / judged=ふりかえり済み / habit=習慣 */
export type TryStatus = 'idea' | 'trying' | 'judged' | 'habit';

/** good=合った / meh=微妙 / bad=合わない */
export type Verdict = 'good' | 'meh' | 'bad';

/** users/{uid}/tries/{id} */
export interface TryItem {
  id: string;
  title: string;
  /** 5分でできる版（ハードルを下げた最初の一歩） */
  mini: string;
  memo: string;
  status: TryStatus;
  /** おためし期間（日数） */
  trialDays: number;
  /** おためし開始日 YYYY-MM-DD */
  trialStart: string | null;
  /** 習慣にした日 YYYY-MM-DD */
  habitStart: string | null;
  /** やった日 YYYY-MM-DD → true（おためし中・習慣の両方で使う） */
  checks: Set<string>;
  verdict: Verdict | null;
  verdictNote: string;
  /** これまでに試した回数（もう一度試すと増える） */
  rounds: number;
  createdAt: number;
}
