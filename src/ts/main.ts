import { User } from 'firebase/auth';
import { onAuthChange, loginWithGoogle, logout } from './auth';
import { showToast, openOverlay, closeOverlay, textEl, button } from './ui';
import { submitFeedback } from './feedback';
import { todayKey, dateKey, labelOf, addDays, daysInMonth } from './dates';
import { HINTS, TRIAL_OPTIONS } from './hints';
import {
  subscribeTries, createIdea, updateIdea, startTrial, setCheck, judge, promoteToHabit,
  restHabit, deleteTry,
} from './store';
import { dayIndex, trialDone, trialEnd, isTrialOver, streak, recentRate } from './stats';
import { TryItem, Verdict } from './types';

// ============================================================
// DOM refs
// ============================================================
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const loginScreen = $('login-screen');
const appEl = $('app');
const userInfo = $('user-info');
const userAvatar = $<HTMLImageElement>('user-avatar');
const userName = $('user-name');
const btnGoogleLogin = $<HTMLButtonElement>('btn-google-login');
const btnLogout = $<HTMLButtonElement>('btn-logout');

const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tabs__btn'));
const panels = Array.from(document.querySelectorAll<HTMLElement>('.panel'));
const countList = $('count-list');
const countHabits = $('count-habits');

const todayDateEl = $('today-date');
const reviewList = $('review-list');
const todayTrials = $('today-trials');
const todayHabits = $('today-habits');
const ideaList = $('idea-list');
const habitList = $('habit-list');
const recordFilter = $('record-filter');
const recordList = $('record-list');
const statTried = $('stat-tried');
const statGood = $('stat-good');
const statHabit = $('stat-habit');

const btnFab = $<HTMLButtonElement>('btn-fab');
const btnAddInline = $<HTMLButtonElement>('btn-add-inline');

const ideaOverlay = $('idea-modal-overlay');
const ideaForm = $<HTMLFormElement>('idea-form');
const ideaModalTitle = $('idea-modal-title');
const inputTitle = $<HTMLInputElement>('input-title');
const inputMini = $<HTMLInputElement>('input-mini');
const inputMemo = $<HTMLTextAreaElement>('input-memo');
const hintBox = $<HTMLDetailsElement>('hint-box');
const hintChips = $('hint-chips');
const btnIdeaSubmit = $<HTMLButtonElement>('btn-idea-submit');

const trialOverlay = $('trial-modal-overlay');
const trialTarget = $('trial-modal-target');
const trialOptions = $('trial-options');
const btnTrialStart = $<HTMLButtonElement>('btn-trial-start');

const judgeOverlay = $('judge-modal-overlay');
const judgeTarget = $('judge-modal-target');
const judgeSummary = $('judge-modal-summary');
const judgeOptions = $('judge-options');
const judgeHabitRow = $('judge-habit-row');
const inputJudgeHabit = $<HTMLInputElement>('input-judge-habit');
const inputJudgeNote = $<HTMLTextAreaElement>('input-judge-note');
const btnJudgeSave = $<HTMLButtonElement>('btn-judge-save');

const habitOverlay = $('habit-modal-overlay');
const habitModalTitle = $('habit-modal-title');
const habitModalStats = $('habit-modal-stats');
const monthLabel = $('month-label');
const calendarGrid = $('calendar-grid');
const btnPrevMonth = $<HTMLButtonElement>('btn-prev-month');
const btnNextMonth = $<HTMLButtonElement>('btn-next-month');
const btnHabitDelete = $<HTMLButtonElement>('btn-habit-delete');
const btnHabitRest = $<HTMLButtonElement>('btn-habit-rest');

const confirmOverlay = $('confirm-dialog-overlay');
const confirmTitle = $('confirm-dialog-title');
const confirmText = $('confirm-dialog-text');
const btnConfirmCancel = $<HTMLButtonElement>('btn-confirm-cancel');
const btnConfirmOk = $<HTMLButtonElement>('btn-confirm-ok');

const feedbackBtn = $<HTMLButtonElement>('feedback-btn');
const feedbackOverlay = $('feedback-modal-overlay');
const inputFeedbackMessage = $<HTMLTextAreaElement>('input-feedback-message');
const btnFeedbackClose = $<HTMLButtonElement>('btn-feedback-close');
const btnFeedbackSend = $<HTMLButtonElement>('btn-feedback-send');

// ============================================================
// State
// ============================================================
type Tab = 'today' | 'list' | 'habits' | 'record';
type RecordFilter = 'all' | Verdict;

interface State {
  uid: string | null;
  unsubscribe: (() => void) | null;
  items: TryItem[];
  loaded: boolean;
  tab: Tab;
  recordFilter: RecordFilter;
  editingId: string | null;
  trialId: string | null;
  trialDays: number;
  judgeId: string | null;
  judgeVerdict: Verdict | null;
  habitId: string | null;
  viewYear: number;
  viewMonth: number;
  pending: Set<string>;
  confirmAction: (() => Promise<void>) | null;
}

const now = new Date();
const state: State = {
  uid: null,
  unsubscribe: null,
  items: [],
  loaded: false,
  tab: 'today',
  recordFilter: 'all',
  editingId: null,
  trialId: null,
  trialDays: 7,
  judgeId: null,
  judgeVerdict: null,
  habitId: null,
  viewYear: now.getFullYear(),
  viewMonth: now.getMonth(),
  pending: new Set(),
  confirmAction: null,
};

const VERDICT_LABEL: Record<Verdict, string> = { good: '合った', meh: '微妙', bad: '合わない' };
const VERDICT_DESC: Record<Verdict, string> = {
  good: 'また続けたい・しっくりきた',
  meh: '悪くないけど、いまいち',
  bad: '自分には合わなかった',
};

// ============================================================
// Helpers
// ============================================================
const findItem = (id: string | null): TryItem | undefined =>
  (id ? state.items.find((i) => i.id === id) : undefined);

const byStatus = (s: TryItem['status']): TryItem[] => state.items.filter((i) => i.status === s);

/** 同じキーの処理が進行中なら何もしない（二重送信防止） */
async function withLock(key: string, fn: () => Promise<void>, errorMessage = '保存に失敗しました。通信環境を確認してください'): Promise<boolean> {
  if (state.pending.has(key)) return false;
  state.pending.add(key);
  renderAll();
  try {
    await fn();
    return true;
  } catch (err) {
    console.error(err);
    showToast(errorMessage);
    return false;
  } finally {
    state.pending.delete(key);
    renderAll();
  }
}

function askConfirm(title: string, text: string, okLabel: string, action: () => Promise<void>): void {
  confirmTitle.textContent = title;
  confirmText.textContent = text;
  btnConfirmOk.textContent = okLabel;
  state.confirmAction = action;
  openOverlay(confirmOverlay);
}

function emptyState(text: string): HTMLElement {
  return textEl('p', 'empty-state', text);
}

function toggleCheck(item: TryItem, date: string): void {
  if (!state.uid) return;
  const uid = state.uid;
  const on = !item.checks.has(date);
  void withLock(`check:${item.id}:${date}`, async () => {
    await setCheck(uid, item.id, date, on);
    if (on && date === todayKey()) showToast(item.status === 'habit' ? 'できた！ 今日もナイスです' : 'やってみた！ その一歩がえらい');
  });
}

function checkButton(item: TryItem, date: string): HTMLButtonElement {
  const done = item.checks.has(date);
  const b = button(done ? 'やった' : 'やった？', `check-btn${done ? ' is-done' : ''}`, () => toggleCheck(item, date));
  b.setAttribute('aria-pressed', String(done));
  b.disabled = state.pending.has(`check:${item.id}:${date}`);
  return b;
}

/** 直近 n 日のドット（左が古い） */
function dots(item: TryItem, from: string, n: number, today: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'dots';
  for (let i = 0; i < n; i++) {
    const d = addDays(from, i);
    const dot = document.createElement('span');
    dot.className = 'dots__dot';
    if (item.checks.has(d)) dot.classList.add('is-done');
    if (d === today) dot.classList.add('is-today');
    if (d > today) dot.classList.add('is-future');
    dot.title = labelOf(d);
    wrap.appendChild(dot);
  }
  return wrap;
}

function miniLine(item: TryItem): HTMLElement | null {
  return item.mini ? textEl('p', 'item-card__mini', `5分版：${item.mini}`) : null;
}

function append(parent: HTMLElement, ...children: (HTMLElement | null)[]): void {
  children.forEach((c) => { if (c) parent.appendChild(c); });
}

// ============================================================
// Render
// ============================================================
function renderTabs(): void {
  tabButtons.forEach((b) => {
    const on = b.dataset.tab === state.tab;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', String(on));
  });
  panels.forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== state.tab));
  const ideas = byStatus('idea').length;
  const habits = byStatus('habit').length;
  countList.textContent = ideas ? String(ideas) : '';
  countHabits.textContent = habits ? String(habits) : '';
}

function renderToday(): void {
  const today = todayKey();
  todayDateEl.textContent = labelOf(today);
  const trying = byStatus('trying');
  const habits = byStatus('habit');

  // ふりかえり待ち
  reviewList.replaceChildren();
  trying.filter((i) => isTrialOver(i, today)).forEach((item) => {
    const card = document.createElement('div');
    card.className = 'review-card';
    append(
      card,
      textEl('p', 'review-card__label', 'おためし期間が終わりました'),
      textEl('p', 'review-card__title', item.title),
      textEl('p', 'review-card__meta', `${item.trialDays}日間のうち ${trialDone(item)}日やりました`),
      button('ふりかえる', 'btn btn--primary btn--sm', () => openJudge(item.id)),
    );
    reviewList.appendChild(card);
  });

  // おためし中
  todayTrials.replaceChildren();
  const active = trying.filter((i) => !isTrialOver(i, today));
  if (!active.length) {
    const empty = emptyState(trying.length
      ? 'おためし中のことは、上でふりかえりを待っています。'
      : 'いまおためし中のことはありません。「やってみたい」リストから1つ選んで試してみましょう。');
    if (!trying.length) {
      const go = button('リストを見る', 'btn btn--ghost btn--sm', () => setTab('list'));
      empty.appendChild(document.createElement('br'));
      empty.appendChild(go);
    }
    todayTrials.appendChild(empty);
  }
  active.forEach((item) => {
    const start = item.trialStart as string;
    const idx = Math.min(Math.max(dayIndex(start, today), 1), item.trialDays);
    const card = document.createElement('div');
    card.className = 'item-card item-card--trial';
    const body = document.createElement('div');
    body.className = 'item-card__body';
    append(
      body,
      textEl('p', 'item-card__badge', `おためし ${idx}日目 / ${item.trialDays}日`),
      textEl('p', 'item-card__title', item.title),
      miniLine(item),
      dots(item, start, item.trialDays, today),
    );
    const side = document.createElement('div');
    side.className = 'item-card__side';
    append(side, checkButton(item, today), button('早めにふりかえる', 'text-btn', () => openJudge(item.id)));
    append(card, body, side);
    todayTrials.appendChild(card);
  });

  // 習慣
  todayHabits.replaceChildren();
  if (!habits.length) {
    todayHabits.appendChild(emptyState('まだ習慣はありません。試して「合った」ものが、ここに育っていきます。'));
  }
  habits.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'item-card';
    const body = document.createElement('div');
    body.className = 'item-card__body';
    const s = streak(item.checks, today);
    append(
      body,
      textEl('p', 'item-card__title', item.title),
      textEl('p', 'item-card__meta', s ? `${s}日連続` : '今日から、また1日目'),
    );
    const side = document.createElement('div');
    side.className = 'item-card__side';
    side.appendChild(checkButton(item, today));
    append(card, body, side);
    todayHabits.appendChild(card);
  });
}

function renderIdeas(): void {
  ideaList.replaceChildren();
  const ideas = byStatus('idea');
  if (!ideas.length) {
    ideaList.appendChild(emptyState(state.loaded
      ? 'まだ何もありません。「ちょっと気になる」くらいのことで十分です。ヒントから選ぶこともできます。'
      : '読み込み中…'));
    return;
  }
  ideas.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'item-card item-card--idea';
    const body = document.createElement('div');
    body.className = 'item-card__body';
    append(
      body,
      textEl('p', 'item-card__title', item.title),
      miniLine(item),
      item.memo ? textEl('p', 'item-card__memo', item.memo) : null,
    );
    const actions = document.createElement('div');
    actions.className = 'item-card__actions';
    append(
      actions,
      button('おためし開始', 'btn btn--primary btn--sm', () => openTrial(item.id)),
      button('編集', 'btn btn--ghost btn--sm', () => openIdea(item.id)),
      button('削除', 'btn btn--ghost btn--sm is-danger', () => confirmDelete(item)),
    );
    append(card, body, actions);
    ideaList.appendChild(card);
  });
}

function renderHabits(): void {
  habitList.replaceChildren();
  const today = todayKey();
  const habits = byStatus('habit');
  if (!habits.length) {
    habitList.appendChild(emptyState('まだ習慣はありません。おためしで「合った」と判定すると、ここで育てられます。'));
    return;
  }
  habits.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'item-card item-card--habit';
    const body = document.createElement('button');
    body.type = 'button';
    body.className = 'item-card__body item-card__body--btn';
    body.addEventListener('click', () => openHabit(item.id));
    const r = recentRate(item, today);
    const s = streak(item.checks, today);
    const stats = document.createElement('div');
    stats.className = 'habit-stats';
    append(
      stats,
      textEl('span', 'habit-stats__item', `連続 ${s}日`),
      textEl('span', 'habit-stats__item', `直近${r.total}日の達成率 ${r.rate}%`),
    );
    append(
      body,
      textEl('p', 'item-card__title', item.title),
      stats,
      dots(item, addDays(today, -13), 14, today),
    );
    const side = document.createElement('div');
    side.className = 'item-card__side';
    side.appendChild(checkButton(item, today));
    append(card, body, side);
    habitList.appendChild(card);
  });
}

function renderRecord(): void {
  const judged = state.items.filter((i) => i.verdict !== null);
  statTried.textContent = String(state.items.filter((i) => i.rounds > 0).length);
  statGood.textContent = String(judged.filter((i) => i.verdict === 'good').length);
  statHabit.textContent = String(byStatus('habit').length);

  recordFilter.replaceChildren();
  const filters: { key: RecordFilter; label: string }[] = [
    { key: 'all', label: 'すべて' },
    { key: 'good', label: VERDICT_LABEL.good },
    { key: 'meh', label: VERDICT_LABEL.meh },
    { key: 'bad', label: VERDICT_LABEL.bad },
  ];
  filters.forEach((f) => {
    const n = f.key === 'all' ? judged.length : judged.filter((i) => i.verdict === f.key).length;
    const b = button(`${f.label} ${n}`, `chip${state.recordFilter === f.key ? ' is-active' : ''}`, () => {
      state.recordFilter = f.key;
      renderRecord();
    });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(state.recordFilter === f.key));
    recordFilter.appendChild(b);
  });

  recordList.replaceChildren();
  const list = judged.filter((i) => state.recordFilter === 'all' || i.verdict === state.recordFilter);
  if (!list.length) {
    recordList.appendChild(emptyState('ふりかえりをすると、ここに試したきろくがたまっていきます。'));
    return;
  }
  list.forEach((item) => {
    const v = item.verdict as Verdict;
    const card = document.createElement('div');
    card.className = 'item-card item-card--record';
    const body = document.createElement('div');
    body.className = 'item-card__body';
    const head = document.createElement('div');
    head.className = 'item-card__head';
    append(
      head,
      textEl('span', `verdict-pill verdict-pill--${v}`, VERDICT_LABEL[v]),
      item.status === 'habit' ? textEl('span', 'status-pill', '習慣にしている') : null,
      item.status === 'trying' ? textEl('span', 'status-pill', 'もう一度おためし中') : null,
    );
    const meta = item.trialStart
      ? `${labelOf(item.trialStart)}から${item.trialDays}日間・${trialDone(item)}日やった${item.rounds > 1 ? `・${item.rounds}回目` : ''}`
      : '';
    append(
      body,
      head,
      textEl('p', 'item-card__title', item.title),
      meta ? textEl('p', 'item-card__meta', meta) : null,
      item.verdictNote ? textEl('p', 'item-card__memo', item.verdictNote) : null,
    );
    const actions = document.createElement('div');
    actions.className = 'item-card__actions';
    if (item.status === 'judged') {
      if (v === 'good') {
        actions.appendChild(button('習慣にする', 'btn btn--primary btn--sm', () => doPromote(item)));
      }
      actions.appendChild(button('もう一度試す', 'btn btn--ghost btn--sm', () => openTrial(item.id)));
      actions.appendChild(button('削除', 'btn btn--ghost btn--sm is-danger', () => confirmDelete(item)));
    }
    append(card, body, actions.childElementCount ? actions : null);
    recordList.appendChild(card);
  });
}

function renderHabitModal(): void {
  const item = findItem(state.habitId);
  if (!item || item.status !== 'habit') {
    if (state.habitId) {
      state.habitId = null;
      closeOverlay(habitOverlay);
    }
    return;
  }
  const today = todayKey();
  habitModalTitle.textContent = item.title;
  const r = recentRate(item, today);
  habitModalStats.replaceChildren();
  append(
    habitModalStats,
    textEl('span', 'mini-stats__item', `連続 ${streak(item.checks, today)}日`),
    textEl('span', 'mini-stats__item', `直近${r.total}日 ${r.done}日できた（${r.rate}%）`),
    textEl('span', 'mini-stats__item', `通算 ${item.checks.size}日`),
  );

  const y = state.viewYear;
  const m = state.viewMonth;
  monthLabel.textContent = `${y}年${m + 1}月`;
  btnNextMonth.disabled = y > now.getFullYear() || (y === now.getFullYear() && m >= new Date().getMonth());
  calendarGrid.replaceChildren();
  const first = new Date(y, m, 1).getDay();
  for (let i = 0; i < first; i++) {
    calendarGrid.appendChild(document.createElement('span'));
  }
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const key = dateKey(new Date(y, m, d));
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'calendar__day';
    cell.textContent = String(d);
    if (item.checks.has(key)) cell.classList.add('is-done');
    if (key === today) cell.classList.add('is-today');
    if (key > today) {
      cell.disabled = true;
      cell.classList.add('is-future');
    } else {
      cell.disabled = state.pending.has(`check:${item.id}:${key}`);
      cell.setAttribute('aria-pressed', String(item.checks.has(key)));
      cell.setAttribute('aria-label', `${labelOf(key)}${item.checks.has(key) ? '（やった）' : ''}`);
      cell.addEventListener('click', () => toggleCheck(item, key));
    }
    calendarGrid.appendChild(cell);
  }
}

function renderAll(): void {
  renderTabs();
  renderToday();
  renderIdeas();
  renderHabits();
  renderRecord();
  renderHabitModal();
}

function setTab(tab: Tab): void {
  state.tab = tab;
  renderTabs();
  window.scrollTo({ top: 0 });
}

// ============================================================
// Idea modal
// ============================================================
function openIdea(id: string | null): void {
  state.editingId = id;
  const item = findItem(id);
  ideaModalTitle.textContent = item ? 'やってみていいことを編集' : 'やってみていいこと';
  btnIdeaSubmit.textContent = item ? '保存する' : 'リストに入れる';
  inputTitle.value = item?.title ?? '';
  inputMini.value = item?.mini ?? '';
  inputMemo.value = item?.memo ?? '';
  hintBox.open = false;
  hintBox.classList.toggle('hidden', !!item);
  openOverlay(ideaOverlay);
  inputTitle.focus();
}

function closeIdea(): void {
  state.editingId = null;
  closeOverlay(ideaOverlay);
}

function renderHints(): void {
  hintChips.replaceChildren();
  HINTS.forEach((h) => {
    hintChips.appendChild(button(h.title, 'chip', () => {
      inputTitle.value = h.title;
      inputMini.value = h.mini;
      inputTitle.focus();
    }));
  });
}

ideaForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!state.uid) return;
  const uid = state.uid;
  const input = {
    title: inputTitle.value.trim().slice(0, 40),
    mini: inputMini.value.trim().slice(0, 60),
    memo: inputMemo.value.trim().slice(0, 200),
  };
  if (!input.title) {
    showToast('やってみたいことを入力してください');
    inputTitle.focus();
    return;
  }
  const editingId = state.editingId;
  btnIdeaSubmit.disabled = true;
  void withLock('idea-form', async () => {
    if (editingId) await updateIdea(uid, editingId, input);
    else await createIdea(uid, input);
    closeIdea();
    showToast(editingId ? '保存しました' : 'リストに入れました');
    if (!editingId && state.tab !== 'list') setTab('list');
  }).finally(() => { btnIdeaSubmit.disabled = false; });
});

// ============================================================
// Trial modal
// ============================================================
function renderTrialOptions(): void {
  trialOptions.replaceChildren();
  TRIAL_OPTIONS.forEach((o) => {
    const b = button(o.label, `segmented__btn${state.trialDays === o.days ? ' is-active' : ''}`, () => {
      state.trialDays = o.days;
      renderTrialOptions();
    });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(state.trialDays === o.days));
    trialOptions.appendChild(b);
  });
}

function openTrial(id: string): void {
  const item = findItem(id);
  if (!item) return;
  state.trialId = id;
  state.trialDays = item.rounds > 0 ? item.trialDays : 7;
  trialTarget.textContent = item.title;
  renderTrialOptions();
  openOverlay(trialOverlay);
}

function closeTrial(): void {
  state.trialId = null;
  closeOverlay(trialOverlay);
}

btnTrialStart.addEventListener('click', () => {
  const item = findItem(state.trialId);
  if (!state.uid || !item) return;
  const uid = state.uid;
  const days = state.trialDays;
  btnTrialStart.disabled = true;
  void withLock(`trial:${item.id}`, async () => {
    await startTrial(uid, item.id, days, todayKey(), item.rounds);
    closeTrial();
    showToast('おためしスタート！ まずは今日、5分だけでも');
    setTab('today');
  }).finally(() => { btnTrialStart.disabled = false; });
});

// ============================================================
// Judge modal
// ============================================================
function renderJudgeOptions(): void {
  judgeOptions.replaceChildren();
  (['good', 'meh', 'bad'] as Verdict[]).forEach((v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `verdict-option verdict-option--${v}${state.judgeVerdict === v ? ' is-active' : ''}`;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(state.judgeVerdict === v));
    append(b, textEl('span', 'verdict-option__label', VERDICT_LABEL[v]), textEl('span', 'verdict-option__desc', VERDICT_DESC[v]));
    b.addEventListener('click', () => {
      state.judgeVerdict = v;
      renderJudgeOptions();
    });
    judgeOptions.appendChild(b);
  });
  judgeHabitRow.classList.toggle('hidden', state.judgeVerdict !== 'good');
  btnJudgeSave.disabled = state.judgeVerdict === null;
}

function openJudge(id: string): void {
  const item = findItem(id);
  if (!item) return;
  state.judgeId = id;
  state.judgeVerdict = null;
  judgeTarget.textContent = item.title;
  const today = todayKey();
  const end = trialEnd(item);
  const elapsed = item.trialStart ? Math.min(dayIndex(item.trialStart, today), item.trialDays) : 0;
  judgeSummary.textContent = end && today > end
    ? `${item.trialDays}日間のうち ${trialDone(item)}日やりました。`
    : `${elapsed}日目までに ${trialDone(item)}日やりました。早めにふりかえってもOKです。`;
  inputJudgeHabit.checked = true;
  inputJudgeNote.value = '';
  renderJudgeOptions();
  openOverlay(judgeOverlay);
}

function closeJudge(): void {
  state.judgeId = null;
  closeOverlay(judgeOverlay);
}

btnJudgeSave.addEventListener('click', () => {
  const item = findItem(state.judgeId);
  const verdict = state.judgeVerdict;
  if (!state.uid || !item || !verdict) return;
  const uid = state.uid;
  const toHabit = verdict === 'good' && inputJudgeHabit.checked;
  const note = inputJudgeNote.value.trim().slice(0, 200);
  btnJudgeSave.disabled = true;
  void withLock(`judge:${item.id}`, async () => {
    await judge(uid, item.id, verdict, note, toHabit, todayKey());
    closeJudge();
    showToast(toHabit ? '習慣に昇格しました！' : verdict === 'good' ? 'きろくしました。いつでも習慣にできます' : '試したきろくに残しました。試せたことが前進です');
  }).finally(() => { btnJudgeSave.disabled = state.judgeVerdict === null; });
});

// ============================================================
// Habit modal / actions
// ============================================================
function openHabit(id: string): void {
  state.habitId = id;
  const d = new Date();
  state.viewYear = d.getFullYear();
  state.viewMonth = d.getMonth();
  openOverlay(habitOverlay);
  renderHabitModal();
}

function closeHabit(): void {
  state.habitId = null;
  closeOverlay(habitOverlay);
}

function shiftMonth(delta: number): void {
  const d = new Date(state.viewYear, state.viewMonth + delta, 1);
  state.viewYear = d.getFullYear();
  state.viewMonth = d.getMonth();
  renderHabitModal();
}

function doPromote(item: TryItem): void {
  if (!state.uid) return;
  const uid = state.uid;
  void withLock(`promote:${item.id}`, async () => {
    await promoteToHabit(uid, item.id, todayKey());
    showToast('習慣に昇格しました！');
  });
}

function confirmDelete(item: TryItem): void {
  askConfirm('削除しますか？', `「${item.title}」と、その記録を削除します。元に戻せません。`, '削除する', async () => {
    if (!state.uid) return;
    const uid = state.uid;
    await withLock(`delete:${item.id}`, async () => {
      await deleteTry(uid, item.id);
      showToast('削除しました');
    }, '削除に失敗しました。通信環境を確認してください');
  });
}

btnHabitDelete.addEventListener('click', () => {
  const item = findItem(state.habitId);
  if (!item) return;
  closeHabit();
  confirmDelete(item);
});

btnHabitRest.addEventListener('click', () => {
  const item = findItem(state.habitId);
  if (!item || !state.uid) return;
  const uid = state.uid;
  askConfirm('おやすみしますか？', `「${item.title}」を習慣から外して「きろく」に移します。記録は残り、あとから「もう一度試す」こともできます。`, 'おやすみする', async () => {
    await withLock(`rest:${item.id}`, async () => {
      await restHabit(uid, item.id);
      closeHabit();
      showToast('おやすみにしました。またいつでも');
    });
  });
});

// ============================================================
// Events
// ============================================================
tabButtons.forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab as Tab)));
btnFab.addEventListener('click', () => openIdea(null));
btnAddInline.addEventListener('click', () => openIdea(null));
$('btn-idea-close').addEventListener('click', closeIdea);
$('btn-idea-cancel').addEventListener('click', closeIdea);
$('btn-trial-close').addEventListener('click', closeTrial);
$('btn-trial-cancel').addEventListener('click', closeTrial);
$('btn-judge-close').addEventListener('click', closeJudge);
$('btn-judge-cancel').addEventListener('click', closeJudge);
$('btn-habit-close').addEventListener('click', closeHabit);
btnPrevMonth.addEventListener('click', () => shiftMonth(-1));
btnNextMonth.addEventListener('click', () => shiftMonth(1));

btnConfirmCancel.addEventListener('click', () => {
  state.confirmAction = null;
  closeOverlay(confirmOverlay);
});
btnConfirmOk.addEventListener('click', async () => {
  const action = state.confirmAction;
  state.confirmAction = null;
  closeOverlay(confirmOverlay);
  if (action) await action();
});

// 背景クリックで閉じる
const overlayClosers: [HTMLElement, () => void][] = [
  [ideaOverlay, closeIdea],
  [trialOverlay, closeTrial],
  [judgeOverlay, closeJudge],
  [habitOverlay, closeHabit],
  [confirmOverlay, () => { state.confirmAction = null; closeOverlay(confirmOverlay); }],
  [feedbackOverlay, () => closeOverlay(feedbackOverlay)],
];
overlayClosers.forEach(([overlay, close]) => {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = overlayClosers.find(([o]) => o.classList.contains('is-open'));
  if (open) open[1]();
});

// Feedback
feedbackBtn.addEventListener('click', () => {
  openOverlay(feedbackOverlay);
  inputFeedbackMessage.focus();
});
btnFeedbackClose.addEventListener('click', () => closeOverlay(feedbackOverlay));
btnFeedbackSend.addEventListener('click', async () => {
  const message = inputFeedbackMessage.value.trim();
  if (!message) {
    showToast('メッセージを入力してください');
    return;
  }
  if (btnFeedbackSend.disabled) return;
  btnFeedbackSend.disabled = true;
  btnFeedbackSend.textContent = '送信中…';
  const ok = await submitFeedback(message);
  btnFeedbackSend.disabled = false;
  btnFeedbackSend.textContent = '送信する';
  if (ok) {
    inputFeedbackMessage.value = '';
    closeOverlay(feedbackOverlay);
    showToast('送信しました。ありがとうございます！');
  } else {
    showToast('送信に失敗しました。時間をおいて再度お試しください');
  }
});

// 日付が変わったら表示を更新（開きっぱなし対策）
let lastDay = todayKey();
window.setInterval(() => {
  const t = todayKey();
  if (t !== lastDay) {
    lastDay = t;
    renderAll();
  }
}, 60000);

// ============================================================
// Auth
// ============================================================
btnGoogleLogin.addEventListener('click', async () => {
  if (btnGoogleLogin.disabled) return;
  btnGoogleLogin.disabled = true;
  try {
    await loginWithGoogle();
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      console.error(err);
      showToast('ログインに失敗しました。もう一度お試しください');
    }
  } finally {
    btnGoogleLogin.disabled = false;
  }
});

btnLogout.addEventListener('click', async () => {
  try {
    await logout();
  } catch (err) {
    console.error(err);
    showToast('ログアウトに失敗しました');
  }
});

function onLogin(user: User): void {
  state.uid = user.uid;
  loginScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  userInfo.classList.remove('hidden');
  userAvatar.src = user.photoURL ?? '';
  userAvatar.alt = user.displayName ?? '';
  userName.textContent = user.displayName ?? '';
  state.unsubscribe = subscribeTries(user.uid, (items) => {
    state.items = items;
    state.loaded = true;
    renderAll();
  }, (err) => {
    console.error(err);
    showToast('データの読み込みに失敗しました。再読み込みしてください');
  });
  renderAll();
}

function onLogout(): void {
  state.unsubscribe?.();
  state.unsubscribe = null;
  state.uid = null;
  state.items = [];
  state.loaded = false;
  [ideaOverlay, trialOverlay, judgeOverlay, habitOverlay, confirmOverlay].forEach(closeOverlay);
  appEl.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  userInfo.classList.add('hidden');
}

renderHints();
onAuthChange((user) => (user ? onLogin(user) : onLogout()));
