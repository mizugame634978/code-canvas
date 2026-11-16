/**
 * XAML references.
 *
 * A XAML file is the other half of a C# class, and it names types and other
 * XAML files without any import statement:
 *
 * - `x:Class="NS.Name"`: the code-behind (every file declaring the class).
 * - `prefix:Type`, where `xmlns:prefix="clr-namespace:NS[;assembly=...]"` (or
 *   `using:NS`): elements such as `<vm:MainViewModel/>` or `<vm:Foo.Prop>`,
 *   and attribute values such as `{x:Type vm:Foo}` or `DataType="vm:Foo"`.
 * - `StartupUri` / `Source` naming another `.xaml`: relative to this file,
 *   or to the project (the nearest folder holding a `.csproj`) when it starts
 *   with `/`, `pack://application:,,,/` or `/Assembly;component/`.
 *
 * Kept free of `vscode` so it is directly testable.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { CsHit, CsTypeIndex } from './csResolve';

/** Replace `<!-- ... -->` with spaces, keeping newlines and offsets. */
export function blankXmlComments(code: string): string {
    return code.replace(/<!--[\s\S]*?(?:-->|$)/g, s => s.replace(/[^\n\r]/g, ' '));
}

const RE_XMLNS = /\bxmlns:([\w.-]+)\s*=\s*"(?:clr-namespace:|using:)([\w.]+)[^"]*"/g;
const RE_X_CLASS = /\bx:Class\s*=\s*"([\w.]+)"/g;
const RE_PREFIXED = /([A-Za-z_][\w.-]*):([A-Za-z_]\w*)/g;
const RE_XAML_PATH = /\b(?:StartupUri|Source)\s*=\s*"([^"]+\.xaml)"/gi;

/** The nearest ancestor of `file` holding a `.csproj`, or undefined. */
function projectDirOf(file: string, cache: Map<string, string | undefined>): string | undefined {
    const dirs: string[] = [];
    let found: string | undefined;
    for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
        if (cache.has(dir)) { found = cache.get(dir); break; }
        dirs.push(dir);
        let names: string[] = [];
        try { names = fs.readdirSync(dir); } catch { /* unreadable: keep walking up */ }
        if (names.some(n => n.toLowerCase().endsWith('.csproj'))) { found = dir; break; }
        if (path.dirname(dir) === dir) break;
    }
    for (const d of dirs) cache.set(d, found);
    return found;
}

/**
 * Every C# type and XAML file one XAML file refers to, once each, at its first
 * mention. `projectDirs` caches the `.csproj` lookup; pass one Map per build.
 */
export function resolveXamlReferences(
    file: string,
    src: string,
    index: CsTypeIndex,
    isFile: (p: string) => boolean,
    projectDirs: Map<string, string | undefined> = new Map(),
): CsHit[] {
    const code = blankXmlComments(src);
    const lineStarts = [0];
    for (let i = 0; i < code.length; i++) if (code[i] === '\n') lineStarts.push(i + 1);
    const lineAt = (offset: number) => {
        let lo = 0;
        let hi = lineStarts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1;
        }
        return lo;
    };

    const hits: CsHit[] = [];
    const seen = new Set<string>();
    const addType = (fqn: string, offset: number) => {
        const files = index.types.get(fqn);
        if (!files || seen.has(fqn)) return;
        seen.add(fqn);
        const name = fqn.slice(fqn.lastIndexOf('.') + 1);
        for (const f of files) hits.push({ file: f, bindings: [{ name, kind: 'named' }], line: lineAt(offset) });
    };

    const prefixes = new Map<string, string>();
    let m: RegExpExecArray | null;
    RE_XMLNS.lastIndex = 0;
    while ((m = RE_XMLNS.exec(code))) prefixes.set(m[1], m[2]);

    RE_X_CLASS.lastIndex = 0;
    while ((m = RE_X_CLASS.exec(code))) addType(m[1], m.index);

    RE_PREFIXED.lastIndex = 0;
    while ((m = RE_PREFIXED.exec(code))) {
        const ns = prefixes.get(m[1]);
        if (ns) addType(`${ns}.${m[2]}`, m.index);
    }

    RE_XAML_PATH.lastIndex = 0;
    while ((m = RE_XAML_PATH.exec(code))) {
        let ref = m[1].replace(/^pack:\/\/application:,,,/i, '').replace(/^\/[^/;]+;component\//i, '/');
        let base = path.dirname(file);
        if (ref.startsWith('/')) {
            base = projectDirOf(file, projectDirs) ?? base;
            ref = ref.slice(1);
        }
        const target = path.resolve(base, ...ref.split('/'));
        if (seen.has(target) || !isFile(target)) continue;
        seen.add(target);
        hits.push({ file: target, bindings: [{ name: path.basename(target), kind: 'named' }], line: lineAt(m.index) });
    }
    return hits;
}
