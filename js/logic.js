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

// ---------- レシート ----------
// 名前の比べ方：ひらがな・カタカナ、全角・半角、空白を区別しない（半角カナもそろえる）
export function receiptKey(s) {
  return toHira(String(s).normalize('NFKC').replace(/\s+/g, ''));
}

// 読み取った行に、最初の選び方を付ける。
//   choice：品目の id ／ 'new'（新しい品目として足す）／ 'skip'（読み飛ばす）
//   n：在庫に足す数（個数の品目と新しい品目のとき）
// 前に覚えた呼び方（aliases）と読み飛ばし（skip）を、AI の当てはめより優先する。
export function planReceipt(items, result, skip = []) {
  const skipSet = new Set(skip.map(receiptKey));
  return result.lines.map(l => {
    const text = String(l.text || l.name || '').trim();
    const k = receiptKey(text);
    const qty = Math.max(1, Math.round(Number(l.qty) || 1));
    const units = Number(l.units) > 0 ? Math.round(Number(l.units)) : null;
    const remembered = items.find(i => i.aliases.some(a => receiptKey(a) === k));
    const byAi = items.find(i => i.name === l.item);
    const hit = remembered || byAi;
    const choice = hit ? hit.id : 'skip';
    // 一覧になく、読み飛ばしとしても覚えていない物は「選んでください」の印を付けて、読み飛ばしを仮に選んでおく
    const unsure = !hit && !skipSet.has(k);
    const n = hit && hit.kind === 'count' ? (units ?? qty * (hit.buyQty || 1)) : (units ?? qty);
    return { text, name: String(l.name || text).trim(), price: Number(l.price) || null, qty, units, choice, n, unsure };
  });
}

// 選んだ内容を、在庫の書き換え・新しい品目・記録・覚える読み飛ばしにする
export function applyReceipt(items, rows, meta = {}) {
  const patches = new Map(); // id → patch
  const creates = [], logs = [], skipAdd = [];
  for (const r of rows) {
    if (r.choice === 'skip') { if (r.text) skipAdd.push(r.text); continue; }
    if (r.choice === 'new') {
      creates.push(normalize({ name: r.name, kind: 'count', unit: '個', qty: r.n, threshold: 0, buyQty: r.n, aliases: r.text && r.text !== r.name ? [r.text] : [], category: 'その他' }));
      logs.push({ type: 'buy', name: r.name, qty: r.n, price: r.price, store: meta.store || '', date: meta.date || '', source: 'レシート' });
      continue;
    }
    const it = items.find(i => i.id === r.choice);
    if (!it) continue;
    const p = patches.get(it.id) || { onList: false, cart: false };
    if (it.kind === 'count') p.qty = (p.qty ?? it.qty ?? 0) + r.n;
    if (it.kind === 'level') p.level = 'たっぷり';
    // レシートでの書き方を覚える（次からは AI に頼らず同じ品目にする）
    const known = [it.name, ...it.aliases, ...(p.aliases || [])].some(a => receiptKey(a) === receiptKey(r.text));
    if (r.text && !known) p.aliases = [...(p.aliases || it.aliases), r.text];
    patches.set(it.id, p);
    logs.push({ type: 'buy', itemId: it.id, name: it.name, qty: it.kind === 'count' ? r.n : null, price: r.price, store: meta.store || '', date: meta.date || '', source: 'レシート' });
  }
  return { updates: [...patches].map(([id, patch]) => ({ id, patch })), creates, logs, skipAdd };
}
