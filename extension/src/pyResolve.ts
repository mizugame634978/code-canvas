/**
 * Python import resolution.
 *
 * The indexer used to look every module up from the workspace root only, so
 * relative imports (`from .user import User`, `from ..models import X`) never
 * resolved, and `from pkg import submodule` pointed at `pkg/__init__.py`
 * instead of `pkg/submodule.py`.
 *
 * Kept free of `vscode` so it is directly testable.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ImportBinding } from './imports';

/**
 * `exists` that also matches letter case below `root`. Windows and macOS file
 * systems answer yes for `models/Order.py` when only `models/order.py` exists,
 * which turned `from .models import Order` (a class) into a bogus submodule.
 * Python itself matches imports case-sensitively on every platform.
 */
export function makeExactCaseExists(
    root: string,
    exists: (p: string) => boolean,
): (p: string) => boolean {
    const listings = new Map<string, Set<string>>();
    const list = (dir: string): Set<string> => {
        let names = listings.get(dir);
        if (!names) {
            try { names = new Set(fs.readdirSync(dir)); } catch { names = new Set(); }
            listings.set(dir, names);
        }
        return names;
    };
    return p => {
        if (!exists(p)) return false;
        const rel = path.relative(root, p);
        if (rel.startsWith('..') || path.isAbsolute(rel)) return true;
        let dir = root;
        for (const seg of rel.split(path.sep)) {
            if (!list(dir).has(seg)) return false;
            dir = path.join(dir, seg);
        }
        return true;
    };
}

export type PyTarget = {
    /** Absolute path of the resolved `.py` file. */
    file: string;
    /** The bindings that actually come from this file. */
    bindings: ImportBinding[];
};

/** `dir/a/b.py`, then `dir/a/b/__init__.py`. No parts means the package itself. */
function probeModule(dir: string, parts: string[], exists: (p: string) => boolean): string | undefined {
    const candidates = parts.length
        ? [path.resolve(dir, ...parts) + '.py', path.resolve(dir, ...parts, '__init__.py')]
        : [path.resolve(dir, '__init__.py')];
    return candidates.find(exists);
}

/**
 * Resolve one import statement to the files it reads.
 *
 * Absolute modules are looked up from `root`. A leading run of dots is
 * relative to `fromFile`: one dot is its own package, each further dot one
 * level up. For `from X import name`, a `name` that is itself a submodule of
 * `X` gets its own target; the remaining names come from `X`.
 */
export function resolvePyImport(
    root: string,
    fromFile: string,
    spec: string,
    bindings: ImportBinding[],
    exists: (p: string) => boolean,
): PyTarget[] {
    const dots = /^\.*/.exec(spec)![0].length;
    let baseDir = root;
    if (dots > 0) {
        baseDir = path.dirname(fromFile);
        for (let i = 1; i < dots; i++) baseDir = path.dirname(baseDir);
    }
    const rest = spec.slice(dots);
    const parts = rest ? rest.split('.') : [];

    const out: PyTarget[] = [];
    const fromModule: ImportBinding[] = [];
    for (const b of bindings) {
        const sub = b.kind === 'named' ? probeModule(baseDir, [...parts, b.name], exists) : undefined;
        if (!sub) { fromModule.push(b); continue; }
        const hit = out.find(t => t.file === sub);
        if (hit) hit.bindings.push(b);
        else out.push({ file: sub, bindings: [b] });
    }

    // `import x` / `from x import *` / plain names: the module itself. When
    // every name was a submodule, the package `__init__.py` is still not read
    // for anything the caller uses, so it gets no edge.
    if (fromModule.length || !bindings.length) {
        const mod = probeModule(baseDir, parts, exists);
        if (mod) out.push({ file: mod, bindings: fromModule });
    }
    return out;
}
