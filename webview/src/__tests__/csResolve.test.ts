import { describe, expect, it } from 'vitest';
import { blankCsCode, buildCsTypeIndex, resolveCsReferences } from '../../../extension/src/csResolve';

describe('blankCsCode', () => {
    it('blanks comments and every string form, keeping offsets and newlines', () => {
        const src = [
            'var a = "Order"; // Order',
            'var b = @"C:\\path\\""Order"""; /* Order',
            '*/ var c = $"{Order}"; var d = \'"\';',
            'var e = """',
            'Order',
            '""";',
            'Keep k;',
        ].join('\n');
        const out = blankCsCode(src);
        expect(out.length).toBe(src.length);
        expect(out.split('\n').length).toBe(src.split('\n').length);
        expect(out).not.toMatch(/Order/);
        expect(out).toMatch(/Keep k;/);
        expect(out).toMatch(/var a =\s+;/);
    });
});

// Names a test file declares, as "Name@file".
const index = buildCsTypeIndex([
    ['A.cs', 'namespace App.Models;\npublic class Order {}\npublic record struct Point(int X);'],
    ['B.cs', 'namespace App.Models { public partial class Order {} }'],
    ['C.cs', 'namespace App.Services;\npublic interface IStore {}\npublic enum Mode { A }'],
    ['D.cs', 'namespace App;\npublic class Shell {}'],
    ['G.cs', 'global using App.Services;'],
]);
const refs = (src: string) => resolveCsReferences(src, index)
    .map(h => `${h.bindings[0].name}@${h.file}:${h.line}`);

describe('buildCsTypeIndex', () => {
    it('records every file of a partial type, and record structs by their name', () => {
        expect(index.types.get('App.Models.Order')).toEqual(['A.cs', 'B.cs']);
        expect(index.types.has('App.Models.Point')).toBe(true);
        expect(index.types.has('App.Models.struct')).toBe(false);
        expect(index.globalUsings).toEqual(['App.Services']);
    });
});

describe('resolveCsReferences', () => {
    it('finds types through usings, global usings and enclosing namespaces', () => {
        const src = 'using App.Models;\nnamespace App.Views;\nclass V { Order o; IStore s; Shell sh; }';
        expect(refs(src)).toEqual(['Order@A.cs:2', 'Order@B.cs:2', 'IStore@C.cs:2', 'Shell@D.cs:2']);
    });

    it('resolves qualified names, aliases, and names relative to an enclosing namespace', () => {
        const src = 'using M = App.Services.Mode;\nnamespace App.Views;\nclass V { App.Models.Order o; M m; Services.IStore s; }';
        expect(refs(src)).toEqual(['Order@A.cs:2', 'Order@B.cs:2', 'Mode@C.cs:2', 'IStore@C.cs:2']);
    });

    it('skips declarations, member accesses, using lines and types out of scope', () => {
        const src = 'using App.Models;\nnamespace Other;\nclass Order { int x = this.Shell; }';
        expect(refs(src)).toEqual([]);
    });

    it('reports a type once, at its first mention', () => {
        const src = 'namespace App.Models;\nclass X {\n Order a;\n Order b; }';
        expect(refs(src)).toEqual(['Order@A.cs:2', 'Order@B.cs:2']);
    });
});
