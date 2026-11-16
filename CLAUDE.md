# code-canvas（fork）— AI 向け作業ガイド

VS Code 拡張「Code Canvas」の fork。ワークスペースの import 関係をキャンバスに描く。
**AI ファーストで開発する。** AI が「再現 → 修正 → 検証（画面確認まで）」を自分で回せることを優先する。

- 設計資料: `__doc__/`（英語・本家由来）。まず `__doc__/01-architecture.md` を読む
- リモート: `origin` = `mizugame634978/code-canvas`（fork）、`upstream` = `Ahsaniat/code-canvas`（本家）
- 作業はブランチで行い、`master` に直接コミットしない

## 検証コマンド（人に確認を頼む前に必ず回す）

| コマンド | 内容 |
|---|---|
| `npm run verify` | 型チェック（extension / webview）→ テスト → ビルド。**作業の区切りごとに必ず通す** |
| `npm test` | vitest。`webview/src/__tests__/` に extension 側のテストも置いている |
| `npm run snapshot -- <フォルダ> [--reveal all\|<相対パス,...>] [--out <png>]` | キャンバスのスクリーンショットを撮る。結果の PNG は Read ツールで見る |

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
| `fixtures/<名前>/` | 解析対象のサンプルプロジェクト。期待する線をテスト（例: `fixtures-python.test.ts`）で固定する |

## バグを直す手順

1. `fixtures/` に再現用のファイルを足す（既存の fixture に足すか、新しく作る）
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
- import 文の行番号（`ImportSpec.line`）は **0 始まり**（VS Code の Position と同じ）
- `webview` をビルドすると `extension/media/` は丸ごと消えて作り直される。手で編集しない
- vitest の中の `console.log` は出力が拾いにくい。調査用の出力はファイルに書き出す

## コードの書き方

- `extension/` と `webview/` のソースは本家に合わせて**英語のコメント**で書く（本家へ PR を出せるようにするため）
- `tools/`、`CLAUDE.md`、fixture の説明は日本語
- vscode に依存しない処理は別ファイルに切り出してテストできるようにする（例: `aliases.ts`、`pyResolve.ts`）
