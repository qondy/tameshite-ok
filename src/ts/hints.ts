/** 思いつかないときのヒント（タップで入力欄に入る） */
export interface Hint {
  title: string;
  mini: string;
}

export const HINTS: Hint[] = [
  { title: '朝いちばんに白湯を飲む', mini: 'コップ1杯だけ' },
  { title: '寝る前にストレッチ', mini: '前屈を1分だけ' },
  { title: '毎日すこし本を読む', mini: '1ページだけ' },
  { title: '1日の終わりに日記を書く', mini: '1行だけ書く' },
  { title: 'ひと駅ぶん歩く', mini: '家のまわりを5分歩く' },
  { title: 'いつもと違う道で帰る', mini: '1本だけ道を変える' },
  { title: '寝る30分前にスマホを置く', mini: '5分だけ早く置く' },
  { title: '朝に部屋の窓を開ける', mini: '1か所だけ開ける' },
  { title: '机の上を片づける', mini: '1つだけ元に戻す' },
  { title: '英単語をおぼえる', mini: '1語だけ' },
  { title: '感謝したことを書き出す', mini: '1つだけ思い出す' },
  { title: '瞑想してみる', mini: '目を閉じて3回深呼吸' },
  { title: '水を多めに飲む', mini: 'デスクに水を置く' },
  { title: '料理を1品つくる', mini: '目玉焼きだけ' },
  { title: '家族や友人に連絡する', mini: 'スタンプを1つ送る' },
  { title: '新しいお店に入ってみる', mini: 'メニューを見るだけ' },
];

export const TRIAL_OPTIONS: { days: number; label: string }[] = [
  { days: 3, label: '3日' },
  { days: 7, label: '1週間' },
  { days: 14, label: '2週間' },
];
