// キャンバスのスクリーンショットを撮る。VS Code を起動せずに、AI が画面を確認するための道具。
//
//   node tools/snapshot.mjs <解析するフォルダ> [オプション]
//
//   --reveal <パス,...>  指定ファイルが見えるように親フォルダを開く（ワークスペースからの相対パス）
//   --reveal all        すべてのフォルダを開く
//   --out <png>         保存先（既定: tools/.cache/snapshots/<フォルダ名>.png）
//   --width / --height  画面サイズ（既定: 1600 x 1000）
//
// 仕組み: 拡張機能の解析処理でグラフを作り（tools/lib/indexer.mjs）、ビルド済みの
// webview（extension/media）を画面なしの Chromium で開いて、VS Code の代わりにデータを渡す。
// 事前に `npm run build` が必要（webview の変更を反映するため）。
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { buildGraph, repoRoot } from './lib/indexer.mjs';

function parseArgs(argv) {
    const opts = { width: 1600, height: 1000 };
    const rest = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--reveal') opts.reveal = argv[++i];
        else if (a === '--out') opts.out = argv[++i];
        else if (a === '--width') opts.width = Number(argv[++i]);
        else if (a === '--height') opts.height = Number(argv[++i]);
        else rest.push(a);
    }
    if (rest.length !== 1) {
        console.error('使い方: node tools/snapshot.mjs <フォルダ> [--reveal <パス,...>|all] [--out <png>]');
        process.exit(2);
    }
    opts.root = rest[0];
    return opts;
}

/** extension/media を配信する。CSP の meta タグは VS Code 用なので外す。 */
function serveMedia() {
    const media = path.join(repoRoot, 'extension', 'media');
    if (!fs.existsSync(path.join(media, 'index.html'))) {
        console.error('extension/media/index.html がありません。先に `npm run build` を実行してください。');
        process.exit(1);
    }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
    const server = http.createServer((req, res) => {
        const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
        const file = path.join(media, url === '/' ? 'index.html' : url);
        if (!file.startsWith(media) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
        let body = fs.readFileSync(file);
        if (file.endsWith('index.html')) {
            body = body.toString('utf8').replace(/<meta http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '');
        }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }).end(body);
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** ページ内で VS Code の代わりをする acquireVsCodeApi。拡張機能と同じ形のメッセージを返す。 */
function fakeHost({ graph, descriptions, code }) {
    const reply = (msg) => setTimeout(() => window.postMessage(msg, '*'), 0);
    window.__ccHostLog = [];
    window.acquireVsCodeApi = () => ({
        postMessage(msg) {
            window.__ccHostLog.push(msg.type);
            if (msg.type === 'requestGraph') {
                reply({ type: 'graph', graph });
                reply({ type: 'autoDescriptions', entries: descriptions });
            } else if (msg.type === 'requestMeta') {
                reply({ type: 'metaLoaded', payload: { files: {} } });
            } else if (msg.type === 'requestCodeMany') {
                reply({ type: 'codeMany', entries: (msg.paths ?? []).map(p => ({ path: p, content: code[p] ?? '' })) });
            }
        },
        getState: () => undefined,
        setState: () => {},
    });
}

/** ノード数と位置が変わらなくなるまで待つ（レイアウトと線の配線は非同期に進む）。 */
async function waitForSettle(page, timeoutMs = 15000) {
    const start = Date.now();
    let last = '';
    let stableSince = Date.now();
    while (Date.now() - start < timeoutMs) {
        const sig = await page.evaluate(() => Array.from(document.querySelectorAll('.react-flow__viewport, .react-flow__node, .react-flow__edge-path'))
            .map(el => (el.getAttribute('style') ?? '') + (el.getAttribute('d') ?? '')).join('|'));
        if (sig && sig === last) {
            if (Date.now() - stableSince > 800) return;
        } else {
            last = sig;
            stableSince = Date.now();
        }
        await page.waitForTimeout(150);
    }
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const { root, graph, descriptions } = await buildGraph(opts.root);
    const code = {};
    for (const n of graph.nodes) {
        if (n.path) { try { code[n.path] = fs.readFileSync(n.path, 'utf8').slice(0, 100000); } catch { /* 読めないファイルは空 */ } }
    }

    const server = await serveMedia();
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: opts.width, height: opts.height } });
        const problems = [];
        page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`); });
        page.on('pageerror', e => problems.push(`[pageerror] ${e.message}`));

        await page.addInitScript(fakeHost, { graph, descriptions, code });
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForSelector('.react-flow__node', { timeout: 15000 });
        await waitForSettle(page);

        if (opts.reveal) {
            // 拡張機能はドライブ名を小文字にそろえる（c:\...）ので、大文字・小文字を無視して突き合わせる
            const key = (p) => path.resolve(p).toLowerCase();
            const files = graph.nodes.filter(n => n.type === 'file').map(n => n.path);
            const wanted = opts.reveal === 'all'
                ? files
                : opts.reveal.split(',').map(r => key(path.resolve(root, r.trim())))
                    .map(k => files.find(f => key(f) === k))
                    .filter(Boolean);
            await page.evaluate(paths => window.postMessage({ type: 'changedFiles', files: paths }, '*'), wanted);
            await waitForSettle(page);
        }
        // 全体が収まるように表示を合わせる（React Flow の「全体表示」ボタン）。
        // アプリは onlyRenderVisibleElements なので、画面外のノードは大きさが未計測で全体表示の計算から漏れる。
        // 1 回合わせると新しく見えたノードが計測されるので、表示範囲が変わらなくなるまで繰り返す。
        const fit = page.locator('.react-flow__controls-fitview');
        const viewportOf = () => page.evaluate(() => document.querySelector('.react-flow__viewport')?.getAttribute('style'));
        for (let i = 0; i < 6 && await fit.count(); i++) {
            const before = await viewportOf();
            await fit.click();
            await waitForSettle(page);
            if (await viewportOf() === before) break;
        }

        const out = path.resolve(opts.out ?? path.join(repoRoot, 'tools', '.cache', 'snapshots', `${path.basename(root)}.png`));
        fs.mkdirSync(path.dirname(out), { recursive: true });
        await page.screenshot({ path: out });

        const counts = await page.evaluate(() => ({
            nodes: document.querySelectorAll('.react-flow__node').length,
            edges: document.querySelectorAll('.react-flow__edge').length,
        }));
        console.log(`保存: ${out}`);
        console.log(`グラフ: ファイル ${graph.nodes.filter(n => n.type === 'file').length} / 線 ${graph.edges.length}（解析結果）`);
        console.log(`画面: ノード ${counts.nodes} / 線 ${counts.edges}（表示中）`);
        if (problems.length) console.log(`ブラウザのエラー・警告:\n  ${problems.join('\n  ')}`);
    } finally {
        await browser.close();
        server.close();
    }
}

main().catch(e => { console.error(e); process.exit(1); });
