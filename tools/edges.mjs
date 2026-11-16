// 拡張機能と同じ解析処理で、ファイル間の線を一覧表示する。画面を撮らずに解析結果だけを確かめる道具。
//
//   node tools/edges.mjs <解析するフォルダ> [--isolated]
//
// 出力は1行1本で「import する側 <- import される側 [取り込んだ名前]」。fixture のテストの期待値と同じ形。
//   --isolated  線が1本もないファイルも表示する
import * as path from 'path';
import { buildGraph } from './lib/indexer.mjs';

const args = process.argv.slice(2);
const showIsolated = args.includes('--isolated');
const root = args.find(a => !a.startsWith('--'));
if (!root) {
    console.error('使い方: node tools/edges.mjs <フォルダ> [--isolated]');
    process.exit(2);
}

const { root: absRoot, graph } = await buildGraph(root);
const rel = new Map(graph.nodes.filter(n => n.type === 'file').map(n => [n.id, path.relative(absRoot, n.path).replace(/\\/g, '/')]));
const lines = graph.edges.map(e => {
    const names = (e.links ?? []).map(l => l.symbolName).filter(Boolean).join(', ');
    return `${rel.get(e.target)} <- ${rel.get(e.source)} [${names}]`;
}).sort();
console.log(lines.join('\n'));

if (showIsolated) {
    const linked = new Set(graph.edges.flatMap(e => [e.source, e.target]));
    const isolated = [...rel].filter(([id]) => !linked.has(id)).map(([, p]) => p).sort();
    console.log(`\n線のないファイル (${isolated.length}):${isolated.map(p => `\n  ${p}`).join('')}`);
}
console.log(`\nファイル ${rel.size} / 線 ${lines.length}`);
