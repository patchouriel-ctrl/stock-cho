// データの置き場所。本番は Firebase（Firestore）、?test=1 のときはこの端末の中だけ（localStorage）。
// どちらも同じ形の「store」を返すので、画面側は違いを気にしない。
//   store.onItems(cb)          品目の一覧が変わるたびに cb(items) を呼ぶ
//   store.add(data)            品目を足す（id を返す）
//   store.update(id, patch)    品目を書き換える
//   store.remove(id)           品目を消す
//   store.batch(list)          [{id, patch}] をまとめて書き換える
//   store.log(entry)           購入などの記録を残す（④ の予測に使う）
//   store.getMeta(name) / store.setMeta(name, data)  品目以外の覚え書き（レシートの読み飛ばしなど）
//   store.user / store.signOut()
import { firebaseConfig } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.0.0';

// ---------- テスト用（この端末の中だけ） ----------
export function testStore() {
  const KEY = 'stock-cho-test';
  let state = JSON.parse(localStorage.getItem(KEY) || '{"items":{},"logs":[]}');
  state.meta ||= {};
  const subs = new Set();
  const save = () => {
    localStorage.setItem(KEY, JSON.stringify(state));
    const list = Object.entries(state.items).map(([id, v]) => ({ id, ...v }));
    subs.forEach(cb => cb(list));
  };
  const newId = () => Math.random().toString(36).slice(2, 12);
  return {
    test: true,
    user: { email: 'テストモード' },
    onItems(cb) { subs.add(cb); save(); return () => subs.delete(cb); },
    async add(data) { const id = newId(); state.items[id] = { ...data, updatedAt: Date.now() }; save(); return id; },
    async update(id, patch) { Object.assign(state.items[id], patch, { updatedAt: Date.now() }); save(); },
    async remove(id) { delete state.items[id]; save(); },
    async batch(list) { for (const { id, patch } of list) Object.assign(state.items[id], patch, { updatedAt: Date.now() }); save(); },
    async log(entry) { state.logs.push({ ...entry, at: Date.now() }); save(); },
    async getMeta(name) { return state.meta[name] || {}; },
    async setMeta(name, data) { state.meta[name] = { ...state.meta[name], ...data }; save(); },
    async signOut() { localStorage.removeItem(KEY); location.reload(); },
  };
}

// ---------- 本番（Firebase） ----------
let fb = null;
async function loadFirebase() {
  if (fb) return fb;
  const [appM, authM, fsM] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = appM.initializeApp(firebaseConfig);
  const auth = authM.getAuth(app);
  await authM.setPersistence(auth, authM.indexedDBLocalPersistence);
  // 電波がなくても読み書きできるよう、端末にも保存しておく（つながったら自動で同期）
  const db = fsM.initializeFirestore(app, {
    localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }),
  });
  fb = { app, auth, db, authM, fsM };
  return fb;
}

// ログイン済みなら user、まだなら null を返す
export async function currentUser() {
  const { auth, authM } = await loadFirebase();
  try { await authM.getRedirectResult(auth); } catch (e) { console.warn('リダイレクトのログイン結果', e); }
  return new Promise(res => {
    const off = authM.onAuthStateChanged(auth, u => { off(); res(u); });
  });
}

export async function signIn() {
  const { auth, authM } = await loadFirebase();
  const provider = new authM.GoogleAuthProvider();
  try {
    await authM.signInWithPopup(auth, provider);
  } catch (e) {
    // ポップアップが使えない環境では、ページごと移動する方式に切り替える
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(e.code)) {
      await authM.signInWithRedirect(auth, provider);
    } else {
      throw e;
    }
  }
}

export async function firebaseStore(user) {
  const { auth, authM, db, fsM } = await loadFirebase();
  const { doc, getDoc, setDoc, collection, addDoc, updateDoc, deleteDoc, onSnapshot, writeBatch, serverTimestamp } = fsM;
  // 世帯：いまはひとり用なので、世帯 ID ＝ 自分の ID
  const hid = user.uid;
  const home = doc(db, 'households', hid);
  try {
    const snap = await getDoc(home);
    if (!snap.exists()) await setDoc(home, { members: [user.uid], name: 'わが家', createdAt: serverTimestamp() });
  } catch (e) {
    // 電波がないときは端末の保存分で続ける（世帯はすでにある前提）
    console.warn('世帯の確認', e);
  }
  const items = collection(home, 'items');
  const logs = collection(home, 'logs');
  return {
    test: false,
    user,
    onItems(cb, onError) {
      return onSnapshot(items, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
    },
    async add(data) {
      // 電波がないと書き込みの完了を待ち続けるので、待たずに id を返す
      const ref = doc(items);
      setDoc(ref, { ...data, updatedAt: serverTimestamp() }).catch(console.error);
      return ref.id;
    },
    async update(id, patch) { updateDoc(doc(items, id), { ...patch, updatedAt: serverTimestamp() }).catch(console.error); },
    async remove(id) { deleteDoc(doc(items, id)).catch(console.error); },
    async batch(list) {
      const b = writeBatch(db);
      for (const { id, patch } of list) b.update(doc(items, id), { ...patch, updatedAt: serverTimestamp() });
      b.commit().catch(console.error);
    },
    async log(entry) { addDoc(logs, { ...entry, at: serverTimestamp() }).catch(console.error); },
    async getMeta(name) {
      try { const s = await getDoc(doc(home, 'meta', name)); return s.exists() ? s.data() : {}; } catch (e) { console.warn('覚え書き', e); return {}; }
    },
    async setMeta(name, data) { setDoc(doc(home, 'meta', name), data, { merge: true }).catch(console.error); },
    async signOut() { await authM.signOut(auth); location.reload(); },
  };
}
