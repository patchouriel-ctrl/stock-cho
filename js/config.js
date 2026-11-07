// Firebase（stock-cho プロジェクト）への接続設定。2026-11-07 に Firebase コンソールで取得。
// ウェブアプリ用の公開してよい識別子（秘密情報ではない）。データの守りは Firestore のセキュリティルールで行う。
export const firebaseConfig = {
  apiKey: "AIzaSyAC2eubj4-ZUhJodWpZrza7_7UypYFGrio",
  authDomain: "stock-cho.firebaseapp.com",
  projectId: "stock-cho",
  storageBucket: "stock-cho.firebasestorage.app",
  messagingSenderId: "86597677264",
  appId: "1:86597677264:web:221fd674a1cb47f112aed5",
};

// レシートを読む AI のモデル（Firebase AI Logic の Gemini Developer API。無料枠で使えて写真と JSON 出力に対応するもの）。
// 2026-11-07 時点で「課金不要」と書かれているのは gemini-3.8-flash と gemini-3.5-flash-lite。
// 使えなくなったら https://firebase.google.com/docs/ai-logic/models で次のモデルを確かめて書き換える。
export const aiModel = 'gemini-3.8-flash';

// App Check（reCAPTCHA Enterprise）のサイトキー。公開してよい値。空のあいだは App Check を使わない。
// AI Logic は 2026-11-02 から App Check が必須なので、レシートを読むにはここにサイトキーが要る。
export const recaptchaSiteKey = '6LeXSBQuAAAAAGXjYNK-upFkTB-OgNG_YOn0qCll'; // Google Cloud の reCAPTCHA「ストック帳（App Check）」、ドメインは patchouriel-ctrl.github.io だけ
