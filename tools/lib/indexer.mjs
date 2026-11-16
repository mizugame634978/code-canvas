// 拡張機能の解析処理（extension/src/graph.ts）を VS Code なしで動かすためのラッパー。
// graph.ts を esbuild でバンドルし、`vscode` を tools/vscode-stub.cjs に差し替えて読み込む。
import { build } from 'esbuild';
import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..', '..');
const cacheDir = path.join(repoRoot, 'tools', '.cache');

let loaded;

/** graph.ts をバンドルして読み込む。毎回ビルドし直すので、ソースの変更がすぐ反映される。 */
async function loadGraphModule() {
    if (loaded) return loaded;
    fs.mkdirSync(cacheDir, { recursive: true });
    const outfile = path.join(cacheDir, 'graph.cjs');
    await build({
        entryPoints: [path.join(repoRoot, 'extension', 'src', 'graph.ts')],
        bundle: true,
        // ESM で出すと fast-glob の動的 require が壊れる（__doc__/09-development.md）
        format: 'cjs',
        platform: 'node',
        outfile,
        alias: { vscode: path.join(repoRoot, 'tools', 'vscode-stub.cjs') },
        logLevel: 'error',
    });
    process.env.CC_REPO_ROOT = repoRoot;
    loaded = createRequire(import.meta.url)(outfile);
    return loaded;
}

/**
 * 拡張機能と同じ手順でグラフを作る。
 * seeds を省くとワークスペースの全ファイルを起点にする（拡張機能は開いているファイル + git の変更ファイル）。
 */
export async function buildGraph(root, { cap = 1000, seeds } = {}) {
    const absRoot = path.resolve(root);
    process.env.CC_ROOT = absRoot;
    const { buildIndex, subgraph, describeGraph } = await loadGraphModule();
    const index = await buildIndex(absRoot);
    const graph = await subgraph(index, seeds ?? [...index.nodes], cap);
    const descriptions = describeGraph(index, graph);
    return { root: absRoot, index, graph, descriptions };
}

/** ノード ID をワークスペースからの相対パス（/ 区切り）に直す。 */
export function relLabel(root, graph) {
    const byId = new Map(graph.nodes.map(n => [n.id, n]));
    return (id) => {
        const n = byId.get(id);
        return n?.path ? path.relative(root, n.path).replace(/\\/g, '/') : (n?.label ?? id);
    };
}
