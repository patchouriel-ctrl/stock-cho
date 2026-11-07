// 使い始めに選ぶ「よくある品目」のひな形。
// kind: 'count'（個数で記録）/ 'level'（たっぷり・少ない・なし）
// threshold: 個数の品目で「この数以下になったら買う」
export const CATEGORIES = ['冷蔵・生鮮', '主食', '調味料', '飲み物', '日用品', '洗剤・衛生', 'その他'];

export const TEMPLATE = [
  { name: '卵', category: '冷蔵・生鮮', kind: 'count', unit: '個', threshold: 3, buyQty: 10 },
  { name: '牛乳', category: '冷蔵・生鮮', kind: 'level' },
  { name: 'ヨーグルト', category: '冷蔵・生鮮', kind: 'count', unit: '個', threshold: 1, buyQty: 1 },
  { name: '納豆', category: '冷蔵・生鮮', kind: 'count', unit: 'パック', threshold: 1, buyQty: 3 },
  { name: '豆腐', category: '冷蔵・生鮮', kind: 'count', unit: '丁', threshold: 0, buyQty: 1 },
  { name: 'バター', category: '冷蔵・生鮮', kind: 'level' },
  { name: 'チーズ', category: '冷蔵・生鮮', kind: 'level' },
  { name: '米', category: '主食', kind: 'level' },
  { name: '食パン', category: '主食', kind: 'level' },
  { name: 'パスタ', category: '主食', kind: 'level' },
  { name: '醤油', category: '調味料', kind: 'level', aliases: ['しょうゆ'] },
  { name: '味噌', category: '調味料', kind: 'level', aliases: ['みそ'] },
  { name: '砂糖', category: '調味料', kind: 'level' },
  { name: '塩', category: '調味料', kind: 'level' },
  { name: 'サラダ油', category: '調味料', kind: 'level', aliases: ['油'] },
  { name: 'マヨネーズ', category: '調味料', kind: 'level' },
  { name: 'ケチャップ', category: '調味料', kind: 'level' },
  { name: 'みりん', category: '調味料', kind: 'level' },
  { name: 'お茶', category: '飲み物', kind: 'count', unit: '本', threshold: 2, buyQty: 6 },
  { name: 'コーヒー', category: '飲み物', kind: 'level' },
  { name: 'トイレットペーパー', category: '日用品', kind: 'count', unit: 'ロール', threshold: 4, buyQty: 12, aliases: ['トイペ'] },
  { name: 'ティッシュ', category: '日用品', kind: 'count', unit: '箱', threshold: 1, buyQty: 5 },
  { name: 'キッチンペーパー', category: '日用品', kind: 'count', unit: 'ロール', threshold: 1, buyQty: 2 },
  { name: 'ゴミ袋', category: '日用品', kind: 'level' },
  { name: 'ラップ', category: '日用品', kind: 'count', unit: '本', threshold: 0, buyQty: 1 },
  { name: '電池', category: '日用品', kind: 'count', unit: '本', threshold: 2, buyQty: 4 },
  { name: '食器用洗剤', category: '洗剤・衛生', kind: 'level' },
  { name: '洗濯洗剤', category: '洗剤・衛生', kind: 'level' },
  { name: 'シャンプー', category: '洗剤・衛生', kind: 'level' },
  { name: 'ボディソープ', category: '洗剤・衛生', kind: 'level' },
  { name: '歯みがき粉', category: '洗剤・衛生', kind: 'count', unit: '本', threshold: 0, buyQty: 1 },
];
