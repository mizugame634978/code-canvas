/**
 * Porcelain v1 parsing for the Git CLI fallback.
 *
 * Kept free of the `vscode` import so it is directly testable and runnable
 * outside the extension host.
 */

import * as path from 'path';

/**
 * Turn `git status --porcelain -z` output into changed file paths, relative
 * to the repository root with `/` separators.
 *
 * `-z` is required: without it Git C-quotes any path with non-ASCII bytes
 * (`"\346\227\245.py"`), which can never match an indexed file. Entries are
 * NUL-terminated `XY path`; a rename/copy entry is followed by one extra
 * field, the old path, which is skipped - only the new path can match.
 */
export function parsePorcelain(stdout: string): string[] {
    const out: string[] = [];
    const fields = (stdout || '').split('\0');
    for (let i = 0; i < fields.length; i++) {
        const entry = fields[i];
        if (entry.length < 4) continue;
        out.push(entry.slice(3));
        if (entry[0] === 'R' || entry[0] === 'C') i++;
    }
    return Array.from(new Set(out));
}

/**
 * Map repository-relative paths to absolute paths under the workspace.
 *
 * `prefix` is `git rev-parse --show-prefix`: where the workspace sits inside
 * the repository (`''` at the root, `sub/dir/` below it). Joining onto the
 * workspace path - rather than onto `--show-toplevel` - keeps the spelling the
 * indexer used (Windows 8.3 short names, symlinks). Paths outside the
 * workspace are dropped.
 */
export function toWorkspacePaths(workspace: string, prefix: string, repoPaths: string[]): string[] {
    const out: string[] = [];
    for (const p of repoPaths) {
        if (!p.startsWith(prefix)) continue;
        out.push(path.join(workspace, ...p.slice(prefix.length).split('/')));
    }
    return out;
}
