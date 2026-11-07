// レシートの写真を読む。写真を Firebase AI Logic 経由で Gemini（無料枠）に渡し、品目の一覧にして返す。
// 決定：設計メモ「レシート読み取りの比較」の B。?test=1 のときは Gemini を使わず、見本の結果を返す。
//   readReceipt(file, items) → { store, date, lines: [{ text, name, item, qty, units, price }] }
import { firebaseConfig, aiModel, recaptchaSiteKey } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.0.0';

// 写真を小さくして（長い辺 2000px）JPEG の base64 にする。送る量を減らし、iPhone の HEIC もここで JPEG になる。
async function toJpegBase64(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}

let model = null;
async function getModel() {
  if (model) return model;
  const [appM, aiM] = await Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-ai.js`)]);
  // data.js が先に作ったアプリ（ログイン済み）を使う。なければ作る。
  const app = appM.getApps()[0] || appM.initializeApp(firebaseConfig);
  if (recaptchaSiteKey) {
    // App Check（悪用よけ、reCAPTCHA Enterprise）。2026-11-02 から AI Logic では必須。
    const ac = await import(`${SDK}/firebase-app-check.js`);
    try {
      ac.initializeAppCheck(app, { provider: new ac.ReCaptchaEnterpriseProvider(recaptchaSiteKey), isTokenAutoRefreshEnabled: true });
    } catch (e) { console.warn('App Check', e); } // 2 回目の初期化はエラーになるので無視
  }
  const { getAI, getGenerativeModel, GoogleAIBackend, Schema } = aiM;
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const schema = Schema.object({
    properties: {
      store: Schema.string(),
      date: Schema.string(),
      lines: Schema.array({
        items: Schema.object({
          properties: {
            text: Schema.string(),
            name: Schema.string(),
            item: Schema.string(),
            qty: Schema.number(),
            units: Schema.number(),
            price: Schema.number(),
          },
          optionalProperties: ['units', 'price'],
        }),
      }),
    },
    optionalProperties: ['store', 'date'],
  });
  model = getGenerativeModel(ai, {
    model: aiModel,
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 },
  });
  return model;
}

function prompt(items) {
  const list = items.map(i => `- ${i.name}${i.aliases.length ? `（ほかの呼び方：${i.aliases.join('、')}）` : ''}`).join('\n');
  return `これは日本のお店のレシートの写真です。買った商品を 1 行ずつ JSON にしてください。
- text：レシートに印字された商品名をそのまま（半角カナもそのまま）
- name：その商品の一般的な名前（例：「ﾀﾏｺﾞ Mｻｲｽﾞ 10ｺ」→「卵」、「ｷｯｺｰﾏﾝ ｺｲｸﾁ」→「醤油」）
- item：下の「うちの品目」のどれに当たるか。品目名をそのまま書く。当たらなければ空の文字列
- qty：買った個数（「×2」「2コ」などがなければ 1）
- units：中身の数が分かるときだけ、買った総数（「卵10個入」を 2 つ → 20）
- price：その行の金額（円、値引き後）
- 値引き・小計・合計・税・ポイント・お預かり・お釣り・レジ袋の行は入れない
- store：店名、date：日付（YYYY-MM-DD）

うちの品目：
${list || '（まだありません）'}`;
}

// ?test=1 用の見本（Gemini を使わずに画面の動きを確かめる）
function sample(items) {
  const has = n => items.some(i => i.name === n) ? n : '';
  return {
    store: 'テストストア', date: new Date().toISOString().slice(0, 10),
    lines: [
      { text: 'ﾀﾏｺﾞ Mｻｲｽﾞ 10ｺ', name: '卵', item: has('卵'), qty: 1, units: 10, price: 268 },
      { text: 'ｷﾞｭｳﾆｭｳ 1000ML', name: '牛乳', item: has('牛乳'), qty: 2, price: 438 },
      { text: 'ﾎﾟﾃﾄﾁｯﾌﾟｽ ｳｽｼｵ', name: 'ポテトチップス', item: '', qty: 1, price: 128 },
      { text: 'USB-C ｹｰﾌﾞﾙ 1M', name: 'USB-Cケーブル', item: has('USB-Cケーブル'), qty: 1, price: 980 },
    ],
  };
}

export async function readReceipt(file, items, test) {
  if (test) { await new Promise(r => setTimeout(r, 800)); return sample(items); }
  const data = await toJpegBase64(file);
  const m = await getModel();
  const res = await m.generateContent([prompt(items), { inlineData: { data, mimeType: 'image/jpeg' } }]);
  const out = JSON.parse(res.response.text());
  return { store: out.store || '', date: out.date || '', lines: Array.isArray(out.lines) ? out.lines : [] };
}
