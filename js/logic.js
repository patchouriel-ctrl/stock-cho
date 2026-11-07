// 画面に依存しない計算（買い物リストの判定など）。
export const LEVELS = ['たっぷり', '少ない', 'なし'];

// 品目の初期値をそろえる
export function normalize(data) {
  const kind = ['count', 'level', 'none'].includes(data.kind) ? data.kind : 'level';
  return {
    name: String(data.name || '').trim(),
    category: data.category || 'その他',
    kind,
    unit: kind === 'count' ? (data.unit || '個') : '',
    threshold: kind === 'count' ? Math.max(0, Number(data.threshold ?? 1)) : null,
    buyQty: kind === 'count' ? Math.max(1, Number(data.buyQty ?? 1)) : null,
    qty: kind === 'count' && data.qty != null ? Number(data.qty) : null,
    level: kind === 'level' && LEVELS.includes(data.level) ? data.level : null,
    aliases: (data.aliases || []).map(s => String(s).trim()).filter(Boolean),
    onList: !!data.onList,
    cart: !!data.cart,
  };
}

// 在庫の状態を文字にする
export function stockText(it) {
  if (it.kind === 'count') return it.qty == null ? '不明' : `${it.qty}${it.unit}`;
  if (it.kind === 'level') return it.level ?? '不明';
  return '記録しない';
}

export function isUnknown(it) {
  return (it.kind === 'count' && it.qty == null) || (it.kind === 'level' && it.level == null);
}

// 在庫から見て買うべきか（しきい値）。理由の文字を返す。買わなくてよければ null。
export function lowReason(it) {
  if (it.kind === 'count' && it.qty != null && it.qty <= it.threshold) {
    return it.qty === 0 ? '切れた' : `残り${it.qty}${it.unit}`;
  }
  if (it.kind === 'level' && (it.level === '少ない' || it.level === 'なし')) {
    return it.level === 'なし' ? '切れた' : '少ない';
  }
  return null;
}

// 今日の買い物リスト。low：在庫が少ない（確実）、manual：自分でリストに入れた物
export function shoppingList(items) {
  const low = [], manual = [], unknown = [];
  for (const it of items) {
    const r = lowReason(it);
    if (r) low.push({ it, reason: r });
    else if (it.onList) manual.push({ it, reason: 'リストに追加' });
    else if (isUnknown(it)) unknown.push(it);
  }
  // 店の中で探しやすいよう、分類ごとにまとめる
  const byCat = (a, b) => a.it.category.localeCompare(b.it.category, 'ja') || a.it.name.localeCompare(b.it.name, 'ja');
  low.sort(byCat);
  manual.sort(byCat);
  return { low, manual, unknown };
}

// 買い物を終えたときの在庫の変化
export function afterBuy(it) {
  const patch = { cart: false, onList: false };
  if (it.kind === 'count') patch.qty = (it.qty ?? 0) + (it.buyQty ?? 1);
  if (it.kind === 'level') patch.level = 'たっぷり';
  return patch;
}

// 名前や呼び名での検索（ひらがな・カタカナを区別しない）
export function toHira(s) {
  return String(s).replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).toLowerCase();
}
export function matches(it, q) {
  if (!q) return true;
  const k = toHira(q.trim());
  return [it.name, ...(it.aliases || [])].some(n => toHira(n).includes(k));
}
