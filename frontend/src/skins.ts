// カラーテーマの定義
export interface ColorTheme {
  primary: string;    // メインカラー
  secondary: string;  // サブカラー
  textColor: string;  // テキストカラー（個別設定）
  logo: string;       // ロゴ（絵文字または画像パス）
}

// 各メンバーのカラーテーマ定義
export const memberThemes: Record<string, ColorTheme> = {
  // デフォルト（すべて、Speciale）
  'default': {
    primary: '#12320d',
    secondary: '#e8d5b7',
    textColor: '#ffffff',
    logo: '/logo.png'
  },
  // 七瀬すず菜
  '七瀬すず菜': {
    primary: '#B9E089',
    secondary: '#EA6969',
    textColor: '#000000',
    logo: '🥗'
  },
  // 早乙女ベリー
  '早乙女ベリー': {
    primary: '#DE6D7C',
    secondary: '#BE9BCD',
    textColor: '#ffffff',
    logo: '🍰🧁'
  },
  // 雲母たまこ
  '雲母たまこ': {
    primary: '#FFD264',
    secondary: '#BE9BCD',
    textColor: '#000000',
    logo: '🐣📛'
  },
  // 酒寄颯馬
  '酒寄颯馬': {
    primary: '#BA6EA5',
    secondary: '#E4DDD2',
    textColor: '#ffffff',
    logo: '🍇'
  },
  // 渚トラウト
  '渚トラウト': {
    primary: '#77B6C2',
    secondary: '#FBA370',
    textColor: '#ffffff',
    logo: '🐟🍴'
  }
};

// 現在選択されているメンバーに基づいてテーマを取得する関数
export function getCurrentTheme(selectedVocalist: string): ColorTheme {
  if (selectedVocalist && memberThemes[selectedVocalist]) {
    return memberThemes[selectedVocalist];
  }
  return memberThemes['default'];
} 