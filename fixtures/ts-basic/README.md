# fixtures/ts-basic

TypeScript / JavaScript の import 解決を確かめるためのサンプル。
期待する線は `webview/src/__tests__/fixtures-ts.test.ts` で固定している。ファイルを変えたらテストも合わせる。

```bash
node tools/edges.mjs fixtures/ts-basic --isolated         # 線の一覧（リポジトリのルートで）
npm run snapshot -- fixtures/ts-basic --reveal all        # キャンバスの見た目を撮る
```

`react` は入れていない（パッケージの import は線を出さない仕様なので、解析には不要）。

## 含めている import の書き方

| ファイル | 書き方 | 確かめたいこと |
|---|---|---|
| `src/main.ts` | `from './app'`（実体は `app.tsx`） | 拡張子の補完 |
| `src/main.ts` | `from '@/config'` / `from '@lib'` | `tsconfig.json` の **`extends` 先**に書いた `paths`（`*` 付きと完全一致） |
| `src/main.ts` | `import './polyfill'` | 副作用だけの import |
| `src/main.ts` | `// import { ghost } from './ghost'` | **コメントアウトされた import は線を出さない** |
| `src/main.ts` | `import('./lazy')` | 動的 import |
| `src/app.tsx` | `from 'react'` | パッケージ（線を出さない） |
| `src/app.tsx` | `from './components'` | **フォルダ内の `index.ts`** |
| `src/app.tsx` | `import type { User }` / `{ type ButtonProps }` | 型だけの import |
| `src/components/index.ts` | `export { } from` / `export type { } from` / `export * from` | 再エクスポート |
| `src/components/Card.tsx` | `from '../lib/date.js'`（実体は `date.ts`） | **ESM 形式の `.js` 指定** |
| `src/lib/legacy.js` | `const { formatDate } = require('./date')` | CommonJS |
| `src/lazy.ts` | 括弧で複数行の import | 複数行 |
| `tsconfig.base.json` | `"@lib": [...],` の末尾カンマ | **末尾カンマのある tsconfig** |

太字はこの fixture を作ったときに見つかり、直したバグ。
