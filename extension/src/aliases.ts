/**
 * TypeScript `compilerOptions.paths` / `baseUrl` resolution.
 *
 * The indexer only ever resolved relative specifiers, so every project using
 * `@/components/...` rendered as disconnected islands. This module reads
 * `tsconfig.json` / `jsconfig.json` and turns a non-relative specifier into
 * candidate absolute bases (the caller probes extensions and index files).
 *
 * Kept free of `vscode` so it is directly testable.
 */

import * as fs from 'fs';
import * as path from 'path';

export type AliasMap = {
    /** Absolute directory non-relative specifiers fall back to. */
    baseUrl?: string;
    /** Pattern -> replacement paths, as written in the config. */
    paths: Record<string, string[]>;
};

/**
 * Strip `//` and block comments from JSONC while leaving string contents
 * alone. tsconfig files routinely carry comments, which JSON.parse rejects.
 */
export function stripJsonComments(text: string): string {
    let out = '';
    let inString = false;
    let inLine = false;
    let inBlock = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i + 1];
        if (inLine) {
            if (c === '\n') { inLine = false; out += c; }
            continue;
        }
        if (inBlock) {
            if (c === '*' && next === '/') { inBlock = false; i++; }
            continue;
        }
        if (inString) {
            out += c;
            if (c === '\\') { out += next ?? ''; i++; continue; }
            if (c === '"') inString = false;
            continue;
        }
        if (c === '"') { inString = true; out += c; continue; }
        if (c === '/' && next === '/') { inLine = true; i++; continue; }
        if (c === '/' && next === '*') { inBlock = true; i++; continue; }
        out += c;
    }
    return out;
}

/**
 * Drop a comma that directly precedes `}` or `]`, outside strings. tsconfig
 * is parsed leniently by TypeScript, so trailing commas are common - and one
 * of them made JSON.parse reject the whole file, silently losing every alias.
 */
export function stripTrailingCommas(text: string): string {
    let out = '';
    let inString = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inString) {
            out += c;
            if (c === '\\') { out += text[i + 1] ?? ''; i++; continue; }
            if (c === '"') inString = false;
            continue;
        }
        if (c === '"') { inString = true; out += c; continue; }
        if (c === ',') {
            let j = i + 1;
            while (j < text.length && /\s/.test(text[j])) j++;
            if (text[j] === '}' || text[j] === ']') continue;
        }
        out += c;
    }
    return out;
}

type TsConfig = {
    extends?: string | string[];
    compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
};

function parseTsConfig(text: string): TsConfig {
    return JSON.parse(stripTrailingCommas(stripJsonComments(text))) as TsConfig;
}

/** Options after `extends`, with every directory already absolute. */
type Effective = {
    baseUrl?: string;
    paths?: Record<string, string[]>;
    /** Directory of the config that declared `paths` (their base when there is no `baseUrl`). */
    pathsDir?: string;
};

function ownOptions(config: TsConfig, configDir: string): Effective {
    const co = config.compilerOptions ?? {};
    const out: Effective = {};
    if (typeof co.baseUrl === 'string') out.baseUrl = path.resolve(configDir, co.baseUrl);
    if (co.paths && typeof co.paths === 'object') { out.paths = co.paths; out.pathsDir = configDir; }
    return out;
}

function toAliasMap(eff: Effective): AliasMap | undefined {
    const paths = eff.paths ?? {};
    if (!eff.baseUrl && !Object.keys(paths).length) return undefined;
    return { baseUrl: eff.baseUrl ?? eff.pathsDir, paths };
}

/**
 * Parse tsconfig/jsconfig text. `configDir` is the directory the file lives in,
 * which `baseUrl` is relative to. Returns undefined when there is nothing to
 * resolve with (no baseUrl and no paths). `extends` is not followed; see
 * `loadAliasConfig`.
 */
export function parseAliasConfig(text: string, configDir: string): AliasMap | undefined {
    try {
        return toAliasMap(ownOptions(parseTsConfig(text), configDir));
    } catch {
        return undefined;
    }
}

const isFile = (p: string) => fs.statSync(p, { throwIfNoEntry: false })?.isFile() ?? false;

/** Locate an `extends` target: a relative/absolute path, or a package under node_modules. */
function resolveExtends(spec: string, fromDir: string): string | undefined {
    if (spec.startsWith('.') || path.isAbsolute(spec)) {
        const p = path.resolve(fromDir, spec);
        return [p, p + '.json'].find(isFile);
    }
    for (let dir = fromDir; ; dir = path.dirname(dir)) {
        const p = path.join(dir, 'node_modules', spec);
        const hit = [p, p + '.json', path.join(p, 'tsconfig.json')].find(isFile);
        if (hit) return hit;
        if (path.dirname(dir) === dir) return undefined;
    }
}

function readEffective(file: string, depth: number): Effective {
    // A cycle or a runaway chain degrades to what was gathered so far.
    if (depth > 10) return {};
    let config: TsConfig;
    try {
        config = parseTsConfig(fs.readFileSync(file, 'utf8'));
    } catch {
        return {};
    }
    const dir = path.dirname(file);
    let out: Effective = {};
    // Later `extends` entries override earlier ones; the file itself overrides them all.
    const bases = Array.isArray(config.extends) ? config.extends : config.extends ? [config.extends] : [];
    for (const spec of bases) {
        const base = typeof spec === 'string' ? resolveExtends(spec, dir) : undefined;
        if (base) out = { ...out, ...readEffective(base, depth + 1) };
    }
    return { ...out, ...ownOptions(config, dir) };
}

/** Read a tsconfig/jsconfig file, following its `extends` chain the way TypeScript does. */
export function loadAliasConfig(file: string): AliasMap | undefined {
    return toAliasMap(readEffective(file, 0));
}

/**
 * Absolute candidate bases for a non-relative specifier, without extension
 * probing. Longer (more specific) patterns are tried first, so `@/x/*` wins
 * over `@/*`. When nothing matches, `baseUrl` itself is the TS fallback.
 */
export function aliasCandidates(spec: string, aliases: AliasMap): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (p: string) => {
        if (!seen.has(p)) { seen.add(p); out.push(p); }
    };
    const baseUrl = aliases.baseUrl ?? '.';
    const entries = Object.entries(aliases.paths).sort((a, b) => b[0].length - a[0].length);
    for (const [pattern, targets] of entries) {
        const star = pattern.indexOf('*');
        if (star < 0) {
            if (spec === pattern) for (const t of targets) push(path.resolve(baseUrl, t));
            continue;
        }
        const prefix = pattern.slice(0, star);
        const suffix = pattern.slice(star + 1);
        if (!spec.startsWith(prefix) || !spec.endsWith(suffix)) continue;
        if (spec.length < prefix.length + suffix.length) continue;
        const middle = spec.slice(prefix.length, spec.length - suffix.length);
        for (const t of targets) push(path.resolve(baseUrl, t.replace('*', middle)));
    }
    if (!out.length && aliases.baseUrl) push(path.resolve(aliases.baseUrl, spec));
    return out;
}

/** Read `tsconfig.json` / `jsconfig.json` from the workspace root. */
export function loadAliases(root: string): AliasMap | undefined {
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
        const p = path.join(root, name);
        if (!isFile(p)) continue;
        const map = loadAliasConfig(p);
        if (map) return map;
    }
    return undefined;
}
