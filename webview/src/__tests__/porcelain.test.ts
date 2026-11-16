import { describe, expect, it } from 'vitest';
import * as path from 'path';
import { parsePorcelain, toWorkspacePaths } from '../../../extension/src/porcelain';

// Input is `git status --porcelain -z`: NUL-terminated entries.
const z = (...entries: string[]) => entries.join('\0') + '\0';

describe('parsePorcelain', () => {
    it('extracts modified and untracked paths', () => {
        expect(parsePorcelain(z(' M src/a.ts', '?? src/b.ts'))).toEqual(['src/a.ts', 'src/b.ts']);
    });

    it('takes the new path from rename entries and skips the old one', () => {
        expect(parsePorcelain(z('R  new/name.ts', 'old/name.ts', ' M x.ts'))).toEqual(['new/name.ts', 'x.ts']);
    });

    it('keeps non-ASCII and spaced paths verbatim', () => {
        expect(parsePorcelain(z('?? 日本語/ファイル.py', ' M a b.ts'))).toEqual(['日本語/ファイル.py', 'a b.ts']);
    });

    it('dedupes and tolerates empty output', () => {
        expect(parsePorcelain('')).toEqual([]);
        expect(parsePorcelain(z(' M a.ts', ' M a.ts'))).toEqual(['a.ts']);
    });
});

describe('toWorkspacePaths', () => {
    const ws = path.resolve('/repo/sub');

    it('joins repository-relative paths onto the workspace at the repo root', () => {
        expect(toWorkspacePaths(ws, '', ['a/b.py'])).toEqual([path.join(ws, 'a', 'b.py')]);
    });

    it('strips the workspace prefix and drops paths outside it', () => {
        expect(toWorkspacePaths(ws, 'sub/', ['sub/a.py', 'other/b.py'])).toEqual([path.join(ws, 'a.py')]);
    });
});
