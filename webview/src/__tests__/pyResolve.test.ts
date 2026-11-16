import { describe, expect, it } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { makeExactCaseExists, resolvePyImport } from '../../../extension/src/pyResolve';
import { parsePyImports, type ImportBinding } from '../../../extension/src/imports';

// A fake workspace: only these files exist. Built with path.resolve so the
// expectations hold on Windows too.
const root = path.resolve('/proj');
const p = (rel: string) => path.resolve(root, rel);
const files = new Set([
    'app/__init__.py',
    'app/config.py',
    'app/models/__init__.py',
    'app/models/user.py',
    'app/models/order.py',
    'app/services/orders.py',
    'app/utils/__init__.py',
    'app/utils/formatting.py',
    'nsonly/helper.py', // namespace package: no __init__.py
].map(p));
const exists = (f: string) => files.has(f);

const named = (...names: string[]): ImportBinding[] => names.map(name => ({ name, kind: 'named' }));
const module: ImportBinding[] = [{ name: '*', kind: 'module' }];

const resolve = (fromRel: string, spec: string, bindings: ImportBinding[]) =>
    resolvePyImport(root, p(fromRel), spec, bindings, exists).map(t => ({
        file: path.relative(root, t.file).replace(/\\/g, '/'),
        names: t.bindings.map(b => b.name),
    }));

describe('resolvePyImport', () => {
    it('resolves absolute modules from the workspace root', () => {
        expect(resolve('main.py', 'app.config', module)).toEqual([{ file: 'app/config.py', names: ['*'] }]);
        expect(resolve('main.py', 'app.models', module)).toEqual([{ file: 'app/models/__init__.py', names: ['*'] }]);
    });

    it('resolves a single dot against the importing file\'s package', () => {
        expect(resolve('app/models/order.py', '.user', named('User')))
            .toEqual([{ file: 'app/models/user.py', names: ['User'] }]);
    });

    it('climbs one level per extra dot', () => {
        expect(resolve('app/services/orders.py', '..models', named('Order', 'User')))
            .toEqual([{ file: 'app/models/__init__.py', names: ['Order', 'User'] }]);
        expect(resolve('app/services/orders.py', '..config', named('TAX')))
            .toEqual([{ file: 'app/config.py', names: ['TAX'] }]);
    });

    it('treats a bare dot as the package itself, and its names as possible submodules', () => {
        expect(resolve('app/models/__init__.py', '.', named('user')))
            .toEqual([{ file: 'app/models/user.py', names: ['user'] }]);
    });

    it('sends submodule names to their own file and the rest to the package', () => {
        expect(resolve('app/services/orders.py', 'app.utils', named('formatting', 'VERSION'))).toEqual([
            { file: 'app/utils/formatting.py', names: ['formatting'] },
            { file: 'app/utils/__init__.py', names: ['VERSION'] },
        ]);
    });

    it('skips the package __init__ when every name is a submodule', () => {
        expect(resolve('app/services/orders.py', 'app.utils', named('formatting')))
            .toEqual([{ file: 'app/utils/formatting.py', names: ['formatting'] }]);
    });

    it('finds submodules of a namespace package with no __init__.py', () => {
        expect(resolve('main.py', 'nsonly', named('helper')))
            .toEqual([{ file: 'nsonly/helper.py', names: ['helper'] }]);
    });

    it('returns nothing for modules outside the workspace', () => {
        expect(resolve('main.py', 'datetime', module)).toEqual([]);
        expect(resolve('main.py', 'os.path', named('join'))).toEqual([]);
    });
});

describe('makeExactCaseExists', () => {
    // Real files from this repo: the check needs an actual directory listing.
    const here = path.resolve(__dirname);
    const exact = makeExactCaseExists(here, fs.existsSync);

    it('accepts a path whose letter case matches', () => {
        expect(exact(path.join(here, 'pyResolve.test.ts'))).toBe(true);
    });

    it('rejects a path that only matches case-insensitively', () => {
        expect(exact(path.join(here, 'PyResolve.test.ts'))).toBe(false);
    });

    it('rejects a path that does not exist at all', () => {
        expect(exact(path.join(here, 'missing.ts'))).toBe(false);
    });
});

describe('parsePyImports', () => {
    it('reads every name of a parenthesised multi-line import', () => {
        const src = [
            'from app.utils.formatting import (',
            '    money,  # currency',
            '    today as now,',
            ')',
            'import os',
        ].join('\n');
        const specs = parsePyImports(src);
        const fmt = specs.find(s => s.spec === 'app.utils.formatting')!;
        expect(fmt.line).toBe(0); // 0-based, like VS Code positions
        expect(fmt.bindings).toEqual([
            { name: 'money', kind: 'named' },
            { name: 'today', alias: 'now', kind: 'named' },
        ]);
        expect(specs.some(s => s.spec === 'os')).toBe(true);
    });
});
