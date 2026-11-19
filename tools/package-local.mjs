// 拡張機能を .vsix にまとめ、普段の VS Code にインストールする。
//
//   node tools/package-local.mjs            # ビルドして .vsix を作るだけ
//   node tools/package-local.mjs --install  # さらに VS Code にインストールする（同じ版でも上書き）
//
// 拡張機能 ID は extension/package.json のもの（mizugame634978.code-canvas）。
// 以前の ID でインストールしたものが残っていると、コマンドが二重に登録されるので先に削除する。
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { repoRoot } from './lib/indexer.mjs';

const install = process.argv.includes('--install');
const ext = path.join(repoRoot, 'extension');
const isWin = process.platform === 'win32';
// 以前に使っていた ID。見つかったらインストール前に削除する
const OLD_IDS = ['local.code-canvas-fork'];

// Windows の npm / code / vsce は .cmd なのでシェル経由で呼ぶ（引数にスペースを含めないこと）
const run = (cmd, args, cwd = repoRoot) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: isWin });

console.log('1/3 ビルド（webview → extension）');
run('npm', ['run', 'build']);

console.log('2/3 .vsix を作成');
const pkg = JSON.parse(fs.readFileSync(path.join(ext, 'package.json'), 'utf8'));
const cacheDir = path.join(repoRoot, 'tools', '.cache');
fs.mkdirSync(cacheDir, { recursive: true });
const vsix = path.join(cacheDir, `${pkg.name}-${pkg.version}.vsix`);
const vsce = path.join(repoRoot, 'node_modules', '.bin', isWin ? 'vsce.cmd' : 'vsce');
// vscode:prepublish（extension のビルド）は vsce が実行する。webview は上でビルド済み
run(vsce, ['package', '--no-dependencies', '--out', vsix], ext);

if (!install) {
    console.log(`\n作成: ${vsix}\nインストールするには: code --install-extension "${vsix}" --force`);
    process.exit(0);
}

console.log('3/3 VS Code にインストール');
const installed = execFileSync('code', ['--list-extensions'], { encoding: 'utf8', shell: isWin }).split(/\r?\n/);
for (const old of OLD_IDS) {
    if (installed.some(id => id.toLowerCase() === old.toLowerCase())) {
        console.log(`以前の ID のものを削除: ${old}`);
        run('code', ['--uninstall-extension', old]);
    }
}
run('code', ['--install-extension', vsix, '--force']);
console.log(`\n完了: ${pkg.publisher}.${pkg.name}。開いている VS Code のウィンドウでは「Developer: Reload Window」を実行すると反映される。`);
