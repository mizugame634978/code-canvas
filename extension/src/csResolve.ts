/**
 * C# references, resolved by type name.
 *
 * C# `using` directives name namespaces, so the indexer used to link a file to
 * every file of each namespace it imported (capped at 8, chosen arbitrarily)
 * and to nothing in its own namespace - where most references live, since
 * they need no `using` at all. Instead, this indexes the types each file
 * declares and links a file to the declaring files of the types it mentions,
 * looked up the way C# does: enclosing namespaces inner to outer, then the
 * file's `using`s and the project's `global using`s.
 *
 * It is a lexical approximation (no semantic model): a member or local that
 * shares a type's name in scope also links to that type.
 *
 * Kept free of `vscode` so it is directly testable.
 */

import type { ImportBinding } from './imports';

export type CsTypeIndex = {
    /** Fully-qualified type name -> files declaring it (several for a partial type). */
    types: Map<string, string[]>;
    /** Namespaces imported into every file by `global using`. */
    globalUsings: string[];
};

export type CsHit = { file: string; bindings: ImportBinding[]; line: number };

/**
 * Replace comments and string/char literals with spaces, keeping newlines and
 * every offset, so type names inside them are never read as references.
 * Handles `"…"`, verbatim `@"…"` (`""` escapes), interpolated `$"…"`,
 * raw `"""…"""` and `'c'`. Interpolation holes are blanked with the string.
 */
export function blankCsCode(code: string): string {
    const out = code.split('');
    const blank = (from: number, to: number) => {
        for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
    };
    let i = 0;
    while (i < code.length) {
        const c = code[i];
        const n = code[i + 1];
        if (c === '/' && n === '/') {
            const e = code.indexOf('\n', i);
            const end = e < 0 ? code.length : e;
            blank(i, end); i = end; continue;
        }
        if (c === '/' && n === '*') {
            const e = code.indexOf('*/', i + 2);
            const end = e < 0 ? code.length : e + 2;
            blank(i, end); i = end; continue;
        }
        if (c === '"' || ((c === '@' || c === '$') && /^[@$]{1,2}"/.test(code.slice(i, i + 3)))) {
            let j = i;
            let verbatim = false;
            while (code[j] === '@' || code[j] === '$') { if (code[j] === '@') verbatim = true; j++; }
            let quotes = 0;
            while (code[j + quotes] === '"') quotes++;
            if (!verbatim && quotes >= 3) {
                const close = '"'.repeat(quotes);
                const e = code.indexOf(close, j + quotes);
                const end = e < 0 ? code.length : e + quotes;
                blank(i, end); i = end; continue;
            }
            let k = j + 1;
            while (k < code.length) {
                const ch = code[k];
                if (verbatim) {
                    if (ch === '"') { if (code[k + 1] === '"') { k += 2; continue; } break; }
                    k++; continue;
                }
                if (ch === '\\') { k += 2; continue; }
                if (ch === '"' || ch === '\n') break;
                k++;
            }
            blank(i, k + 1); i = k + 1; continue;
        }
        if (c === "'") {
            let k = i + 1;
            k += code[k] === '\\' ? 2 : 1;
            while (k < code.length && code[k] !== "'" && code[k] !== '\n' && k - i < 12) k++;
            blank(i, k + 1); i = k + 1; continue;
        }
        i++;
    }
    return out.join('');
}

const RE_NAMESPACE = /\bnamespace\s+([A-Za-z_][\w.]*)/g;
// `record class` / `record struct` must not capture `class`/`struct` as the name.
const RE_TYPE_DECL = /\b(?:class|struct|interface|enum|record(?:\s+(?:class|struct))?)\s+([A-Za-z_]\w*)/g;
const RE_USING = /^[ \t]*(global[ \t]+)?using[ \t]+(?:static[ \t]+)?(?:([A-Za-z_]\w*)[ \t]*=[ \t]*)?([A-Za-z_][\w.]*)[ \t]*;/gm;
const RE_NAME_CHAIN = /[A-Za-z_]\w*(?:\s*\.\s*[A-Za-z_]\w*)*/g;
// A name right after one of these words is being declared, not referenced.
const DECLARING = /\b(?:class|struct|interface|enum|record|namespace)\s*$/;

/** Namespace declarations in source order, as [offset, name]. */
function namespacesOf(code: string): [number, string][] {
    const out: [number, string][] = [];
    RE_NAMESPACE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RE_NAMESPACE.exec(code))) out.push([m.index, m[1]]);
    return out;
}

/** The namespace a position falls in: the last one declared before it (block nesting is not modelled). */
function namespaceAt(namespaces: [number, string][], offset: number): string {
    let ns = '';
    for (const [at, name] of namespaces) {
        if (at > offset) break;
        ns = name;
    }
    return ns;
}

/** First pass over every C# file: who declares which type, and the global usings. */
export function buildCsTypeIndex(sources: Iterable<readonly [string, string]>): CsTypeIndex {
    const types = new Map<string, string[]>();
    const globalUsings = new Set<string>();
    for (const [file, src] of sources) {
        const code = blankCsCode(src);
        const namespaces = namespacesOf(code);
        RE_TYPE_DECL.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = RE_TYPE_DECL.exec(code))) {
            const ns = namespaceAt(namespaces, m.index);
            const fqn = ns ? `${ns}.${m[1]}` : m[1];
            const files = types.get(fqn) ?? [];
            if (!files.includes(file)) files.push(file);
            types.set(fqn, files);
        }
        RE_USING.lastIndex = 0;
        while ((m = RE_USING.exec(code))) if (m[1] && !m[2]) globalUsings.add(m[3]);
    }
    return { types, globalUsings: [...globalUsings] };
}

/** Second pass for one file: every project type it mentions, once per type, at its first mention. */
export function resolveCsReferences(src: string, index: CsTypeIndex): CsHit[] {
    let code = blankCsCode(src);
    const namespaces = namespacesOf(code);

    const usings = new Set(index.globalUsings);
    const aliases = new Map<string, string>();
    RE_USING.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RE_USING.exec(code))) {
        if (m[2]) aliases.set(m[2], m[3]);
        else usings.add(m[3]);
    }
    // Using directives import names; they are not uses of them.
    code = code.replace(RE_USING, s => s.replace(/[^\n]/g, ' '));

    const lookup = (segs: string[], offset: number): { fqn: string; name: string; alias?: string } | undefined => {
        const enclosing: string[] = [];
        for (let ns = namespaceAt(namespaces, offset); ns; ns = ns.includes('.') ? ns.slice(0, ns.lastIndexOf('.')) : '') {
            enclosing.push(ns);
        }
        enclosing.push('');
        // The longest prefix of `A.B.C` that names a type wins, so `MyApp.Models.Order.Create` finds `Order`.
        for (let k = segs.length; k >= 1; k--) {
            const rel = segs.slice(0, k).join('.');
            for (const scope of enclosing) {
                const fqn = scope ? `${scope}.${rel}` : rel;
                if (index.types.has(fqn)) return { fqn, name: segs[k - 1] };
            }
            if (k > 1) continue;
            const aliased = aliases.get(rel);
            if (aliased && index.types.has(aliased)) return { fqn: aliased, name: aliased.slice(aliased.lastIndexOf('.') + 1), alias: rel };
            for (const u of usings) {
                const fqn = `${u}.${rel}`;
                if (index.types.has(fqn)) return { fqn, name: rel };
            }
        }
        return undefined;
    };

    const hits: CsHit[] = [];
    const seen = new Set<string>();
    let line = 0;
    let scanned = 0;
    RE_NAME_CHAIN.lastIndex = 0;
    while ((m = RE_NAME_CHAIN.exec(code))) {
        for (; scanned < m.index; scanned++) if (code[scanned] === '\n') line++;
        // `x.Order` is a member access on `x`, and `class Order` declares it.
        const before = code.slice(Math.max(0, m.index - 12), m.index);
        if (/\.\s*$/.test(before) || DECLARING.test(before)) continue;
        const hit = lookup(m[0].split(/\s*\.\s*/), m.index);
        if (!hit || seen.has(hit.fqn)) continue;
        seen.add(hit.fqn);
        for (const file of index.types.get(hit.fqn)!) {
            hits.push({ file, bindings: [{ name: hit.name, alias: hit.alias, kind: 'named' }], line });
        }
    }
    return hits;
}
