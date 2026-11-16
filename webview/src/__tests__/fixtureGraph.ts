import * as path from 'path';
import { buildIndex, subgraph } from '../../../extension/src/graph';
import type { Graph } from '../../../extension/src/util';

/**
 * Run the real indexer (vscode is stubbed in vite.config.ts) over
 * fixtures/<name> and list its edges as "importer <- provider [names]",
 * sorted - the same reading order as `node tools/edges.mjs`.
 */
export async function fixtureGraph(name: string): Promise<{ graph: Graph; edges: string[]; isolated: string[] }> {
    const root = path.resolve(__dirname, '../../../fixtures', name);
    process.env.CC_ROOT = root;
    const index = await buildIndex(root);
    const graph = await subgraph(index, [...index.nodes], 1000);
    const rel = new Map(graph.nodes.filter(n => n.type === 'file').map(n => [n.id, path.relative(root, n.path!).replace(/\\/g, '/')]));
    const edges = graph.edges.map(e => {
        const names = (e.links ?? []).map(l => l.symbolName).filter(Boolean).join(', ');
        return `${rel.get(e.target)} <- ${rel.get(e.source)} [${names}]`;
    }).sort();
    const linked = new Set(graph.edges.flatMap(e => [e.source, e.target]));
    const isolated = [...rel].filter(([id]) => !linked.has(id)).map(([, p]) => p).sort();
    return { graph, edges, isolated };
}
