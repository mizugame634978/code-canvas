// `vscode` モジュールの身代わり。tools/lib/indexer.mjs がバンドル時に差し込む。
// 拡張機能の解析処理（graph.ts）が使う最小限の API だけを用意する。
// - 設定値は extension/package.json の既定値を返す（ユーザー設定は無い前提）
// - LSP（シンボル取得）は常に空を返す。線のシンボル表示は import 文から拾った分だけになる
const path = require('path');
// esbuild でバンドルされると __dirname が tools/.cache になるので、indexer.mjs が場所を渡す
const repoRoot = process.env.CC_REPO_ROOT ?? path.join(__dirname, '..');
const pkg = require(path.join(repoRoot, 'extension', 'package.json'));

const defaults = {};
for (const [key, spec] of Object.entries(pkg.contributes.configuration.properties)) {
    defaults[key] = spec.default;
}

class Position { constructor(line, character) { this.line = line; this.character = character; } }
class Range { constructor(start, end) { this.start = start; this.end = end; } }

module.exports = {
    workspace: {
        getConfiguration: (section) => ({
            get: (key) => defaults[section ? `${section}.${key}` : key],
        }),
        get workspaceFolders() {
            return [{ uri: { fsPath: process.env.CC_ROOT } }];
        },
    },
    Uri: { file: (p) => ({ fsPath: p, toString: () => p }) },
    SymbolKind: { Class: 4, Method: 5, Function: 11, Variable: 12, Constant: 13, Interface: 10 },
    commands: { executeCommand: async () => [] },
    Position,
    Range,
};
