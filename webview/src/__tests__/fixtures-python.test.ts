import { beforeAll, describe, expect, it } from 'vitest';
import * as path from 'path';
import { buildIndex, subgraph } from '../../../extension/src/graph';
import type { Graph } from '../../../extension/src/util';

// End to end over fixtures/python-basic: the real indexer (with the vscode
// stub from vite.config.ts) must draw exactly the import edges listed in that
// fixture's README, and none to the standard library.
const root = path.resolve(__dirname, '../../../fixtures/python-basic');

let graph: Graph;
let edges: string[];

beforeAll(async () => {
    process.env.CC_ROOT = root;
    const index = await buildIndex(root);
    graph = await subgraph(index, [...index.nodes], 1000);
    const rel = new Map(graph.nodes.filter(n => n.path).map(n => [n.id, path.relative(root, n.path!).replace(/\\/g, '/')]));
    // "importer <- provider [names]", the same reading order as the README table.
    edges = graph.edges.map(e => {
        const names = (e.links ?? []).map(l => l.symbolName).filter(Boolean).join(', ');
        return `${rel.get(e.target)} <- ${rel.get(e.source)} [${names}]`;
    }).sort();
});

describe('fixtures/python-basic', () => {
    // Whole-module imports (`import a.b`) carry no symbol name, hence [].
    it('draws every import edge, with the imported names, and nothing else', () => {
        expect(edges).toEqual([
            'app/cli.py <- app/config.py []',
            'app/cli.py <- app/services/notify.py [notify_created]',
            'app/cli.py <- app/services/orders.py [OrderService]',
            'app/models/__init__.py <- app/models/order.py [Order]',
            'app/models/__init__.py <- app/models/user.py [User]',
            'app/models/order.py <- app/models/user.py [User]',
            'app/services/notify.py <- app/services/orders.py [OrderService]',
            'app/services/notify.py <- app/utils/formatting.py [money, today]',
            'app/services/orders.py <- app/models/__init__.py [Order, User]',
            'app/services/orders.py <- app/utils/formatting.py [formatting]',
            'app/utils/formatting.py <- app/config.py [CURRENCY]',
            'main.py <- app/cli.py [run]',
            'scripts/seed.py <- app/models/user.py []',
            'tests/test_orders.py <- app/services/orders.py [OrderService]',
        ]);
    });

    it('keeps the unused module as an isolated node', () => {
        const legacy = graph.nodes.find(n => n.path?.endsWith('legacy.py'));
        expect(legacy).toBeDefined();
        expect(graph.edges.some(e => e.source === legacy!.id || e.target === legacy!.id)).toBe(false);
    });
});
