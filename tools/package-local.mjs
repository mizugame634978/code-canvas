// fork 版の拡張機能を .vsix にまとめ、普段の VS Code にインストールする。
//
//   node tools/package-local.mjs            # ビルドして .vsix を作るだけ
//   node tools/package-local.mjs --install  # さらに VS Code にインストールする（同じ版でも上書き）
//
// 拡張機能 ID を本家（ahsaniat.code-canvas-oss）から変えて local.code-canvas-fork にする。
// 同じ ID のままだと、マーケットプレイスの本家版が出たときに自動更新で上書きされ、fork の修正が消えるため。
// extension/package.json 自体は変えず、作業用のコピーだけを書き換える（本家へ PR を出せるように）。
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { repoRoot } from './lib/indexer.mjs';

const install = process.argv.includes('--install');
const ext = path.join(repoRoot, 'extension');
const stage = path.join(repoRoot, 'tools', '.cache', 'vsix');
const isWin = process.platform === 'win32';

// Windows の npm / code は .cmd なのでシェル経由で呼ぶ（引数にスペースを含めないこと）
const run = (cmd, args, cwd = repoRoot) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: isWin });

console.log('1/3 ビルド（webview → extension）');
run('npm', ['run', 'build']);

console.log('2/3 .vsix を作成');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for (const name of ['dist', 'media', 'README.md', 'CHANGELOG.md', 'SUPPORT.md', 'LICENSE', 'icon.png', '.vscodeignore']) {
    const from = path.join(ext, name);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(stage, name), { recursive: true });
}
const pkg = JSON.parse(fs.readFileSync(path.join(ext, 'package.json'), 'utf8'));
pkg.publisher = 'local';
pkg.name = 'code-canvas-fork';
pkg.displayName = 'Code Canvas (fork)';
// ビルドは上で済ませた。コピー先には src が無いので、vsce に再ビルドさせない
delete pkg.scripts?.['vscode:prepublish'];
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 4) + '\n');

const vsix = path.join(repoRoot, 'tools', '.cache', `code-canvas-fork-${pkg.version}.vsix`);
const vsce = path.join(repoRoot, 'node_modules', '.bin', isWin ? 'vsce.cmd' : 'vsce');
execFileSync(vsce, ['package', '--no-dependencies', '--out', vsix], { cwd: stage, stdio: 'inherit', shell: isWin });

if (!install) {
    console.log(`\n作成: ${vsix}\nインストールするには: code --install-extension "${vsix}" --force`);
    process.exit(0);
}

console.log('3/3 VS Code にインストール');
execFileSync('code', ['--install-extension', vsix, '--force'], { stdio: 'inherit', shell: isWin });
console.log('\n完了。開いている VS Code のウィンドウでは「Developer: Reload Window」を実行すると反映される。');
