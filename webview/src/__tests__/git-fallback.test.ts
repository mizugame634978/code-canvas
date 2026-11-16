import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getChangedFiles } from '../../../extension/src/git';
import { buildIndex } from '../../../extension/src/graph';

// The `git status` fallback (used when VS Code's Git extension is unavailable;
// the vscode stub has none) must return paths the webview can match against
// indexed nodes - i.e. exactly the keys of `index.nodes`.
let ws: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: ws, stdio: 'pipe' });
const write = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(ws, rel)), { recursive: true });
    fs.writeFileSync(path.join(ws, rel), text);
};

beforeAll(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-git-'));
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    git('config', 'core.autocrlf', 'false');
    write('pkg/a.py', 'import pkg.b\n');
    write('pkg/b.py', 'X = 1\n');
    write('pkg/old.py', 'Y = 2\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'init');

    write('pkg/a.py', 'import pkg.b\nimport pkg.new\n'); // modified
    git('mv', 'pkg/old.py', 'pkg/renamed.py');           // renamed (staged)
    write('pkg/new.py', 'Z = 3\n');                      // untracked file in a tracked folder
    write('fresh/inner.py', 'W = 4\n');                  // untracked folder
    write('日本語/ファイル.py', 'V = 5\n');               // non-ASCII path
    process.env.CC_ROOT = ws;
});

afterAll(() => {
    fs.rmSync(ws, { recursive: true, force: true });
});

describe('getChangedFiles (git status fallback)', () => {
    it('returns indexed absolute paths for every kind of change', async () => {
        const index = await buildIndex(ws);
        const changed = await getChangedFiles();
        const rel = (p: string) => path.relative(ws, p).replace(/\\/g, '/');

        expect(changed.map(rel).sort()).toEqual([
            'fresh/inner.py',
            'pkg/a.py',
            'pkg/new.py',
            'pkg/renamed.py',
            '日本語/ファイル.py',
        ]);
        for (const f of changed) expect(index.nodes.has(f), f).toBe(true);
    });
});
