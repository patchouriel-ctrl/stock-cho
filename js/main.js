// ストック帳の画面。タブは「買い物」「在庫」「設定」の 3 つ。
import { testStore, currentUser, signIn, firebaseStore } from './data.js';
import { TEMPLATE, CATEGORIES } from './template.js';
import { LEVELS, normalize, stockText, isUnknown, lowReason, shoppingList, afterBuy, matches } from './logic.js';

export const VERSION = 'v2';
const TEST = new URLSearchParams(location.search).has('test');
const $app = document.getElementById('app');

let store = null;
let items = [];
let tab = 'shop';
let query = '';
let sheet = null; // 開いている下からの画面 { type: 'edit', id } / { type: 'template' }

// ピンチやダブルタップで画面が拡大されないようにする（iPhone の Safari は viewport の指定だけでは拡大を止めない）
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, e => e.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
// 押す場所以外を素早く 2 回たたいたときは、2 回目を無かったことにする
let lastTap = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTap < 350 && !e.target.closest('button, input, select, textarea, label, a')) e.preventDefault();
  lastTap = now;
}, { passive: false });

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byId = id => items.find(i => i.id === id);
// 並び順：ひな形の順（よく使う物が上）、ひな形にない物は名前順で後ろに
const tplOrder = name => { const i = TEMPLATE.findIndex(t => t.name === name); return i < 0 ? 999 : i; };
const byOrder = (a, b) => tplOrder(a.name) - tplOrder(b.name) || a.name.localeCompare(b.name, 'ja');

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2200);
}

// ---------- 起動 ----------
async function boot() {
  if (!TEST && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.warn);
  try {
    if (TEST) {
      store = testStore();
    } else {
      const user = await currentUser();
      if (!user) return renderLogin();
      store = await firebaseStore(user);
    }
    store.onItems(list => { items = list.map(d => ({ id: d.id, ...normalize(d) })); render(); },
      e => { console.error(e); renderError('データを読めませんでした', e); });
  } catch (e) {
    console.error(e);
    renderError('起動できませんでした', e);
  }
}

function renderLogin(err) {
  $app.innerHTML = `
    <div class="center">
      <h1 class="logo">ストック帳</h1>
      <p class="muted">在庫と買い物リストを、声と画面で。</p>
      <button class="primary big" data-action="login">Google でログイン</button>
      ${err ? `<p class="error">${esc(err)}</p>` : ''}
    </div>`;
}

function renderError(title, e) {
  $app.innerHTML = `<div class="center"><h2>${esc(title)}</h2><p class="error">${esc(e?.code || e?.message || e)}</p>
    <button class="primary" onclick="location.reload()">もう一度読み込む</button></div>`;
}

// ---------- 画面全体 ----------
function render() {
  const list = shoppingList(items);
  const count = list.low.length + list.manual.length;
  $app.innerHTML = `
    ${TEST ? '<div class="testbar">テストモード（この端末の中だけに保存）</div>' : ''}
    <main class="${tab === 'shop' && items.some(i => i.cart) ? 'with-floating' : ''}">${tab === 'shop' ? shopView(list) : tab === 'stock' ? stockView() : settingsView()}</main>
    <nav class="tabs">
      ${tabBtn('shop', '買い物', count)}
      ${tabBtn('stock', '在庫')}
      ${tabBtn('settings', '設定')}
    </nav>
    ${sheet ? sheetView() : ''}`;
}

function tabBtn(key, label, badge) {
  return `<button class="tab ${tab === key ? 'on' : ''}" data-action="tab" data-tab="${key}">
    ${label}${badge ? `<span class="badge">${badge}</span>` : ''}</button>`;
}

// ---------- 買い物タブ ----------
function shopView({ low, manual, unknown }) {
  if (!items.length) return emptyStart();
  const inCart = items.filter(i => i.cart).length;
  // かごに入れていない行には、右に「外す」（自分で入れた物）か「在庫を直す」（在庫が少ない物）を出す
  const fixBtn = (it, reason) => it.cart ? '' : reason === 'リストに追加'
    ? `<button class="row-x" data-action="unlist" data-id="${it.id}">外す</button>`
    : `<button class="row-x" data-action="fixstock" data-id="${it.id}">在庫を直す</button>`;
  const rows = arr => arr.map(({ it, reason }) => `
    <li class="shop-row ${it.cart ? 'done' : ''}">
      <button class="check" data-action="cart" data-id="${it.id}" aria-label="かごに入れた">${it.cart ? '✓' : ''}</button>
      <div class="grow" data-action="cart" data-id="${it.id}">
        <div class="name">${esc(it.name)}</div>
        <div class="sub">${esc(reason)}${it.kind === 'count' && it.qty != null && reason !== '切れた' && !reason.startsWith('残り') ? `（残り${it.qty}${esc(it.unit)}）` : ''}</div>
      </div>
      ${it.cart && it.kind === 'count' ? `
        <div class="stepper small">
          <button data-action="buyqty" data-id="${it.id}" data-d="-1">−</button>
          <span>${it.buyQty}${esc(it.unit)}</span>
          <button data-action="buyqty" data-id="${it.id}" data-d="1">＋</button>
        </div>` : ''}
      ${fixBtn(it, reason)}
    </li>`).join('');
  return `
    <header class="head"><h1>今日の買い物</h1></header>
    ${!low.length && !manual.length ? '<p class="empty">いま買う物はありません 🎉</p>' : ''}
    ${low.length ? `<h2 class="sec">在庫が少ない</h2><ul class="list">${rows(low)}</ul>` : ''}
    ${manual.length ? `<h2 class="sec">リストに入れた物</h2><ul class="list">${rows(manual)}</ul>` : ''}
    ${unknown.length ? `<p class="note" data-action="tab" data-tab="stock">在庫が「不明」の品目が ${unknown.length} 件あります。分かるものだけ在庫タブで入れてください。</p>` : ''}
    ${inCart ? `<div class="floating"><button class="primary big" data-action="finish">買い物を終える（${inCart} 品を在庫に入れる）</button></div>` : ''}`;
}

function emptyStart() {
  return `<div class="center">
    <h2>まず、うちで使う物を選びましょう</h2>
    <p class="muted">よくある品目の一覧から、家で使う物を押していくだけです。在庫の数は、あとで分かったものから入れれば大丈夫です。</p>
    <button class="primary big" data-action="open-template">よくある品目から選ぶ</button>
    <button class="ghost" data-action="new">自分で品目を足す</button>
  </div>`;
}

// ---------- 在庫タブ ----------
function stockView() {
  if (!items.length) return emptyStart();
  const shown = items.filter(i => matches(i, query));
  const cats = [...new Set([...CATEGORIES, ...items.map(i => i.category)])];
  const groups = cats.map(c => [c, shown.filter(i => i.category === c).sort(byOrder)])
    .filter(([, arr]) => arr.length);
  return `
    <header class="head">
      <h1>在庫</h1>
      <button class="primary" data-action="new">＋ 品目</button>
    </header>
    <input class="search" type="search" placeholder="品目をさがす" value="${esc(query)}" data-input="query">
    ${groups.map(([c, arr]) => `<h2 class="sec">${esc(c)}</h2><ul class="list">${arr.map(stockRow).join('')}</ul>`).join('')}
    ${!groups.length ? '<p class="empty">見つかりません</p>' : ''}`;
}

function stockRow(it) {
  const low = lowReason(it);
  let ctl = '';
  if (it.kind === 'count') {
    ctl = `<div class="stepper">
      <button data-action="qty" data-id="${it.id}" data-d="-1" ${it.qty == null || it.qty <= 0 ? 'disabled' : ''}>−</button>
      <button class="qty ${it.qty == null ? 'unknown' : ''}" data-action="setqty" data-id="${it.id}">${it.qty == null ? '?' : it.qty}<small>${esc(it.unit)}</small></button>
      <button data-action="qty" data-id="${it.id}" data-d="1">＋</button>
    </div>`;
  } else if (it.kind === 'level') {
    ctl = `<div class="seg">${LEVELS.map(l => `<button class="${it.level === l ? 'on lv-' + l : ''}" data-action="level" data-id="${it.id}" data-level="${l}">${l}</button>`).join('')}</div>`;
  } else {
    ctl = `<span class="muted small">記録しない</span>`;
  }
  return `<li class="stock-row ${low ? 'low' : ''}">
    <button class="name-btn" data-action="edit" data-id="${it.id}">
      <span class="name">${esc(it.name)}</span>
      <span class="sub">${isUnknown(it) ? '在庫不明' : low ? esc(low) : ''}</span>
    </button>
    ${ctl}
    <button class="list-btn ${it.onList ? 'on' : ''}" data-action="onlist" data-id="${it.id}" aria-label="買い物リストに入れる">🛒</button>
  </li>`;
}

// ---------- 設定タブ ----------
function settingsView() {
  return `
    <header class="head"><h1>設定</h1></header>
    <ul class="list plain">
      <li><button class="row-btn" data-action="open-template">うちで使う物を選ぶ（よくある品目から足す・外す）</button></li>
      <li><button class="row-btn" data-action="new">自分で品目を足す</button></li>
    </ul>
    <h2 class="sec">アカウント</h2>
    <ul class="list plain">
      <li class="row-info">${esc(store.user.email)}</li>
      <li><button class="row-btn danger" data-action="signout">${store.test ? 'テストデータを消す' : 'ログアウト'}</button></li>
    </ul>
    <p class="muted small center-text">ストック帳 ${VERSION}　品目 ${items.length} 件</p>`;
}

// ---------- 下からの画面（編集・ひな形） ----------
function sheetView() {
  return `<div class="overlay" data-action="close-sheet"></div>
    <div class="sheet">${sheet.type === 'template' ? templateSheet() : sheet.type === 'qty' ? qtySheet() : editSheet()}</div>`;
}

// 在庫の量を直す画面（在庫タブの数字、買い物タブの「在庫を直す」から開く）
function qtySheet() {
  const it = byId(sheet.id);
  if (!it) { sheet = null; return ''; }
  if (it.kind === 'level') {
    return `
    <div class="sheet-head"><h2>${esc(it.name)} はいまどのくらい？</h2><button class="ghost" data-action="close-sheet">閉じる</button></div>
    <div class="level-pick">${LEVELS.map(l => `<button data-action="picklevel" data-level="${l}" class="${it.level === l ? 'on' : ''} lv-${l}">${l}</button>`).join('')}</div>
    ${it.onList ? `<button class="ghost" data-action="unlist" data-id="${it.id}">買い物リストから外すだけ（在庫は直さない）</button>` : ''}`;
  }
  return `
    <div class="sheet-head"><h2>${esc(it.name)} はいま何${esc(it.unit)}？</h2><button class="ghost" data-action="close-sheet">閉じる</button></div>
    <div class="numpad">${Array.from({ length: 13 }, (_, n) => `<button data-action="pickqty" data-n="${n}" class="${it.qty === n ? 'on' : ''}">${n}</button>`).join('')}</div>
    <form id="qty-form" class="row-form">
      <input name="qty" type="number" inputmode="numeric" min="0" placeholder="ほかの数" value="">
      <button class="primary" type="submit">決定</button>
    </form>
    ${it.onList ? `<button class="ghost" data-action="unlist" data-id="${it.id}">買い物リストから外すだけ（在庫は直さない）</button>` : ''}`;
}

// よくある品目の一覧。緑＝うちで使う物。押すたびに緑と白が切り替わる。
// 最初は何も選ばれていない。すでに追加した物は緑で始まり、白にすると外せる。
function templateSheet() {
  const have = new Set(items.map(i => i.name));
  return `
    <div class="sheet-head"><h2>うちで使う物を選ぶ</h2><button class="ghost" data-action="close-sheet">閉じる</button></div>
    <p class="muted small">家で使う物を押して<b class="ok">緑</b>にしてください。もう一度押すと外れます。</p>
    <form id="tpl-form">
      ${CATEGORIES.filter(c => TEMPLATE.some(t => t.category === c)).map(c => `<h3 class="sec">${esc(c)}</h3><div class="chips">
        ${TEMPLATE.filter(t => t.category === c).map(t => `<label class="chip"><input type="checkbox" name="t" value="${esc(t.name)}" ${have.has(t.name) ? 'checked data-had' : ''}><span>${esc(t.name)}</span></label>`).join('')}
      </div>`).join('')}
      <div class="sheet-foot"><button class="primary big" type="submit" data-tpl-submit disabled>品目を選んでください</button></div>
    </form>`;
}

// 押した数に合わせて、決定ボタンの文字を変える（何が起きるかを押す前に分かるように）
function tplChanges() {
  const f = document.getElementById('tpl-form');
  const boxes = [...f.querySelectorAll('input[name=t]')];
  const add = boxes.filter(b => b.checked && !b.hasAttribute('data-had')).map(b => b.value);
  const drop = boxes.filter(b => !b.checked && b.hasAttribute('data-had')).map(b => b.value);
  return { f, add, drop };
}
function syncTplButton() {
  const { f, add, drop } = tplChanges();
  const btn = f.querySelector('[data-tpl-submit]');
  const parts = [add.length && `${add.length} 品目を追加`, drop.length && `${drop.length} 品目を外す`].filter(Boolean);
  btn.disabled = !parts.length;
  btn.textContent = parts.length ? parts.join('・') : (items.length ? '変更はありません' : '品目を選んでください');
}

function editSheet() {
  const it = sheet.id ? byId(sheet.id) : normalize({ name: '', kind: 'count', category: 'その他' });
  if (!it) { sheet = null; return ''; }
  const cats = [...new Set([...CATEGORIES, ...items.map(i => i.category)])];
  return `
    <div class="sheet-head"><h2>${sheet.id ? '品目を編集' : '品目を足す'}</h2>
      <div class="head-btns">
        ${sheet.id ? `<button class="ghost danger ${sheet.confirmDelete ? 'confirm' : ''}" type="button" data-action="delete" data-id="${it.id}">${sheet.confirmDelete ? 'もう一度押すと消えます' : '消す'}</button>` : ''}
        <button class="ghost" data-action="close-sheet">閉じる</button>
      </div>
    </div>
    <form id="edit-form">
      <label class="field">名前<input name="name" required value="${esc(it.name)}" placeholder="例：卵"></label>
      <label class="field">分類<select name="category">${cats.map(c => `<option ${c === it.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <fieldset class="field"><legend>記録の仕方</legend>
        <div class="seg wide">
          ${[['count', '個数'], ['level', '段階'], ['none', '記録しない']].map(([k, l]) =>
            `<label><input type="radio" name="kind" value="${k}" ${it.kind === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}
        </div>
        <p class="muted small" data-kind-help></p>
      </fieldset>
      <div class="count-only">
        <label class="field">単位<input name="unit" value="${esc(it.unit || '個')}" placeholder="個・本・ロールなど"></label>
        <label class="field">この数以下になったら買う<input name="threshold" type="number" inputmode="numeric" min="0" value="${it.threshold ?? 1}"></label>
        <label class="field">いつも買う数<input name="buyQty" type="number" inputmode="numeric" min="1" value="${it.buyQty ?? 1}"></label>
      </div>
      <label class="field">ほかの呼び方（声やレシート用。「、」で区切る）<input name="aliases" value="${esc(it.aliases.join('、'))}" placeholder="例：たまご、玉子"></label>
      <button class="primary big" type="submit">保存</button>
    </form>`;
}

function syncKindFields() {
  const f = document.getElementById('edit-form');
  if (!f) return;
  const k = f.kind.value;
  f.querySelector('.count-only').hidden = k !== 'count';
  f.querySelector('[data-kind-help]').textContent = {
    count: '数えやすい物（卵 6 個、トイレットペーパー 4 ロール）',
    level: '数えにくい物（調味料、米、牛乳）を「たっぷり／少ない／なし」で',
    none: '在庫は記録せず、買い物リストに入れるときだけ使う',
  }[k];
}

// ---------- 操作 ----------
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;
  const it = id ? byId(id) : null;
  switch (action) {
    case 'login':
      try { await signIn(); location.reload(); } catch (err) { console.error(err); renderLogin(`ログインできませんでした（${err.code || err.message}）`); }
      return;
    case 'tab': tab = el.dataset.tab; sheet = null; render(); window.scrollTo(0, 0); return;
    case 'cart': store.update(id, { cart: !it.cart }); return;
    case 'buyqty': store.update(id, { buyQty: Math.max(1, it.buyQty + Number(el.dataset.d)) }); return;
    case 'finish': return finishShopping();
    case 'qty': store.update(id, { qty: Math.max(0, (it.qty ?? 0) + Number(el.dataset.d)) }); return;
    case 'setqty': sheet = { type: 'qty', id }; render(); return;
    // 買い物タブの「在庫を直す」から開いたときは、直したらリストからも外す（「まだあった」という意味なので）
    case 'pickqty': store.update(sheet.id, { qty: Number(el.dataset.n), ...(sheet.fromShop ? { onList: false } : {}) }); sheet = null; render(); return;
    case 'picklevel': store.update(sheet.id, { level: el.dataset.level, ...(sheet.fromShop ? { onList: false } : {}) }); sheet = null; render(); return;
    case 'unlist':
      sheet = null;
      store.update(id, { onList: false, cart: false });
      toast(`${it.name} を買い物リストから外しました`);
      return;
    case 'fixstock': sheet = { type: 'qty', id, fromShop: true }; render(); return;
    case 'level': store.update(id, { level: it.level === el.dataset.level ? null : el.dataset.level }); return;
    case 'onlist':
      store.update(id, { onList: !it.onList });
      toast(it.onList ? `${it.name} をリストから外しました` : `${it.name} を買い物リストに入れました`);
      return;
    case 'edit': sheet = { type: 'edit', id }; render(); syncKindFields(); return;
    case 'new': sheet = { type: 'edit', id: null }; render(); syncKindFields(); return;
    case 'open-template': sheet = { type: 'template' }; render(); syncTplButton(); return;
    case 'close-sheet': sheet = null; render(); return;
    case 'delete':
      if (!sheet.confirmDelete) { sheet.confirmDelete = true; render(); syncKindFields(); return; }
      store.remove(id); sheet = null; toast(`${it.name} を消しました`); return;
    case 'signout': store.signOut(); return;
  }
});

document.addEventListener('change', e => {
  if (e.target.name === 'kind') syncKindFields();
  if (e.target.name === 't') syncTplButton();
});

document.addEventListener('input', e => {
  if (e.target.dataset.input === 'query') {
    query = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const s = document.querySelector('.search');
    s.focus(); s.setSelectionRange(pos, pos);
  }
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'qty-form') {
    const n = Number(f.qty.value);
    if (f.qty.value !== '' && Number.isFinite(n) && n >= 0) store.update(sheet.id, { qty: Math.floor(n), ...(sheet.fromShop ? { onList: false } : {}) });
    sheet = null;
    render();
  }
  if (f.id === 'tpl-form') {
    const { add, drop } = tplChanges();
    for (const t of TEMPLATE.filter(t => add.includes(t.name))) await store.add(normalize(t));
    for (const it of items.filter(i => drop.includes(i.name))) await store.remove(it.id);
    sheet = null;
    tab = 'stock';
    toast(add.length && drop.length ? `${add.length} 品目を追加し、${drop.length} 品目を外しました`
      : add.length ? `${add.length} 品目を追加しました` : `${drop.length} 品目を外しました`);
    render();
  }
  if (f.id === 'edit-form') {
    const fd = new FormData(f);
    const name = fd.get('name').trim();
    if (!name) return;
    if (items.some(i => i.name === name && i.id !== sheet.id)) { toast(`「${name}」はもうあります`); return; }
    const old = sheet.id ? byId(sheet.id) : {};
    const data = normalize({
      ...old,
      name,
      category: fd.get('category'),
      kind: fd.get('kind'),
      unit: fd.get('unit'),
      threshold: fd.get('threshold'),
      buyQty: fd.get('buyQty'),
      aliases: fd.get('aliases').split(/[、,，]/),
    });
    if (sheet.id) await store.update(sheet.id, data); else await store.add(data);
    toast(sheet.id ? '保存しました' : `${name} を足しました`);
    sheet = null;
    render();
  }
});

async function finishShopping() {
  const bought = items.filter(i => i.cart);
  if (!bought.length) return;
  await store.batch(bought.map(it => ({ id: it.id, patch: afterBuy(it) })));
  for (const it of bought) {
    store.log({ type: 'buy', itemId: it.id, name: it.name, qty: it.kind === 'count' ? it.buyQty : null, source: '画面' });
  }
  toast(`${bought.length} 品を在庫に入れました`);
}

boot();
