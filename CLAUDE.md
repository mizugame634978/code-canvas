# code-canvas（fork）— AI 向け作業ガイド

VS Code 拡張「Code Canvas」の fork。ワークスペースの import 関係をキャンバスに描く。
**AI ファーストで開発する。** AI が「再現 → 修正 → 検証（画面確認まで）」を自分で回せることを優先する。

- **最初に `__doc__/00-principles.md`（開発の原則）を読む。** 判断に迷ったらそこに従い、書いていないことはユーザーに聞く
- 設計資料: `__doc__/`（01〜10 は英語・本家由来）。構造は `__doc__/01-architecture.md` から読む
- リモート: `origin` = `mizugame634978/code-canvas`（fork）、`upstream` = `Ahsaniat/code-canvas`（本家）。本家からは独立して育てる（原則 6）
- 作業はブランチで行い、`master` に直接コミットしない

## 検証コマンド（人に確認を頼む前に必ず回す）

| コマンド | 内容 |
|---|---|
| `npm run verify` | 型チェック（extension / webview）→ テスト → ビルド。**作業の区切りごとに必ず通す** |
| `npm test` | vitest。`webview/src/__tests__/` に extension 側のテストも置いている |
| `node tools/edges.mjs <フォルダ> [--isolated]` | 解析結果の線を1行1本で一覧表示する。画面を撮るより速く確実。fixture のテストと同じ形式 |
| `npm run snapshot -- <フォルダ> [--reveal all\|<相対パス,...>] [--out <png>]` | キャンバスのスクリーンショットを撮る。結果の PNG は Read ツールで見る |
| `npm run install:local` | ビルド → `.vsix` 作成 → 普段の VS Code にインストール（ID は `mizugame634978.code-canvas`）。以前の ID（`local.code-canvas-fork`）が残っていれば削除する。`package:local` は `.vsix` を作るだけ |

- スナップショットは**ビルド済みの** webview（`extension/media`）を使う。webview を直したら先に `npm run build`
- 既定の保存先は `tools/.cache/snapshots/`（git 管理外）。出力にブラウザのエラー・警告も表示される
- CI（`.github/workflows/ci.yml`）は Ubuntu と Windows の両方で型チェック・テスト・ビルドを行う。PR を出したら `gh pr checks` で結果を確認する
  （このPCの `gh` は PATH に無いことがある。`"/c/Program Files/GitHub CLI/gh.exe"` で呼ぶ）
- 人の確認が必要なのは VS Code 本体との連携だけ（ファイルを開く、保存で再描画、LSP のシンボル、設定画面）。
  それ以外は AI がテストとスナップショットで確かめてから報告する

## ハーネスの構成

| 場所 | 役割 |
|---|---|
| `tools/vscode-stub.cjs` | `vscode` モジュールの身代わり。設定値は `extension/package.json` の既定値、LSP は常に空 |
| `tools/lib/indexer.mjs` | `extension/src/graph.ts` を esbuild でバンドルし、スタブで動かす（`buildGraph(root)`） |
| `tools/snapshot.mjs` | 上のグラフをヘッドレス Chromium の webview に流し込み、撮影する |
| `webview/vite.config.ts` の `test.alias` | テストでも `vscode` をスタブに差し替える。これで `graph.ts` を丸ごとテストできる |
| `fixtures/<名前>/` | 解析対象のサンプルプロジェクト（`python-basic`、`ts-basic`、`csharp-wpf`）。期待する線を `fixtures-<言語>.test.ts` で固定する。各 README に含めた書き方の一覧がある |
| `webview/src/__tests__/fixtureGraph.ts` | fixture を解析して線の一覧を返すテスト用の補助関数 |

## バグを直す手順

1. `fixtures/` に再現用のファイルを足す（既存の fixture に足すか、新しく作る）。`node tools/edges.mjs` で今の結果を見る
2. テストに期待値を書き、**修正前に失敗することを確認する**
3. 修正して `npm run verify`
4. 画面に関わる修正なら `npm run snapshot` で撮って、画像を見て確かめる
5. 新しく分かった落とし穴は、下の一覧に追記する

## 落とし穴（実際に踏んだもの）

- **拡張機能はパスのドライブ名を小文字にする**（`c:\Users\...`）。パスを比べるときは大文字・小文字を無視するか、正規化してから比べる
- **Windows / macOS のファイルシステムは大文字・小文字を区別しない**。`exists('Order.py')` は `order.py` があるだけで true になる。
  Python の import 解決は `makeExactCaseExists`（`extension/src/pyResolve.ts`）を通す
- **テストの期待パスに `/proj` のような POSIX 形式の文字列を直書きしない**。Windows では `path.resolve` が `C:\proj` を返す。期待値も `path.resolve` で作る
- **webview は `onlyRenderVisibleElements`**。画面外のノードは DOM に無く、大きさも未計測。DOM の要素数は「表示中の数」でしかない。
  全体表示（fitView）は1回では全ノードを含まないので、`snapshot.mjs` は表示範囲が変わらなくなるまで繰り返している
- **esbuild でバンドルしたファイル内の `__dirname` はバンドル先**（`tools/.cache`）になる。スタブは `CC_REPO_ROOT` 環境変数でリポジトリの場所を受け取る
- **拡張機能内でファイルパスを受け渡すときは `normalizePath`（`graph.ts`）の形にそろえる**。webview はパスの文字列が完全一致しないとノードを見つけられない
- **`git status --porcelain` は `-z` なしだと日本語などのパスを `"\346\227..."` とエスケープする**。パスはリポジトリのルート基準で、未追跡のフォルダはフォルダ名だけになる（`--untracked-files=all` で中身が出る）
- **`fs.existsSync` はフォルダでも true**。import 先の候補を調べるときはファイルかどうか（`isFile`）で判定する（`./components` がフォルダそのものに解決されていた）
- **tsconfig は JSON ではない**。コメント・末尾カンマ・`extends` がある。読み込みは `aliases.ts` の `loadAliasConfig` を使う
- **import を正規表現で探すときはコメントを先に消す**（`blankJsComments`）。行番号を保つため、削除ではなく空白に置き換える
- **C# は `using` ではなく型の名前で線を引く**（`csResolve.ts`）。`using` は名前空間しか分からず、同じ名前空間の参照は `using` 自体が無いため。XAML（`xamlResolve.ts`）も同じ型の一覧を使う
- **新しい言語・ファイル種別を足すときの触る場所**: `graph.ts`（GLOB・`EXT_LANG`・`parseForLang`・解決処理）、`describe.ts`（`SourceLang`・説明文・公開シンボル・`LANG_NAME`）、`webview/src/code/highlight.ts`（色分け）
- **既定の除外パターン（`extension/package.json` の `codeCanvas.excludeGlobs`）は言語ごとのビルド出力を入れる**。.NET の `obj/` が抜けていて生成ファイルでキャンバスが埋まっていた。`bin/` は Node の CLI のソース置き場でもあるので `bin/Debug|Release/` だけを除外している
- サンプルだけでなく、このPCの実プロジェクト（`../PrismHandsOn` などの WPF）に `node tools/edges.mjs` を当てると、サンプルで想定していない問題が見つかる（読むだけで書き換えない）
- import 文の行番号（`ImportSpec.line`）は **0 始まり**（VS Code の Position と同じ）
- **拡張機能 ID は本家（`ahsaniat.code-canvas-oss`）と変えてある**（`extension/package.json`）。同じ ID に戻すと、マーケットプレイスの本家版の自動更新で上書きされる。ID を変えたら、古い ID を `tools/package-local.mjs` の `OLD_IDS` に足す（残っているとコマンドが二重に登録される）
- `webview` をビルドすると `extension/media/` は丸ごと消えて作り直される。手で編集しない
- vitest の中の `console.log` は出力が拾いにくい。調査用の出力はファイルに書き出す

## コードの書き方

- コメントは、新しく書く部分・書き換える部分は**日本語**。既存の英語コメントは、そのコードに手を入れるときに必要なら書き換える（一括翻訳はしない。原則 7）
- 文書・fixture の説明・PR の説明は日本語。コミットメッセージは英語の要約 + 本文
- vscode に依存しない処理は別ファイルに切り出してテストできるようにする（例: `aliases.ts`、`pyResolve.ts`）
