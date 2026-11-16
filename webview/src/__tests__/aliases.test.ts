import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { aliasCandidates, loadAliasConfig, parseAliasConfig, stripJsonComments, stripTrailingCommas } from '../../../extension/src/aliases';

describe('stripJsonComments', () => {
    it('removes comments but leaves string contents alone', () => {
        const src = `{
  // baseUrl below
  "baseUrl": "./src", /* block */
  "urls": ["http://x//y", "a/*b"]
}`;
        const parsed = JSON.parse(stripJsonComments(src));
        expect(parsed.baseUrl).toBe('./src');
        expect(parsed.urls).toEqual(['http://x//y', 'a/*b']);
    });
});

describe('parseAliasConfig', () => {
    it('parses baseUrl and paths out of JSONC', () => {
        const cfg = `{
            // a comment
            "compilerOptions": {
                "baseUrl": ".",
                "paths": { "@/*": ["src/*"], "~/*": ["src/*"] }
            }
        }`;
        const map = parseAliasConfig(cfg, '/proj')!;
        expect(map.baseUrl).toBe(path.resolve('/proj'));
        expect(map.paths['@/*']).toEqual(['src/*']);
    });

    it('returns undefined when nothing is configured', () => {
        expect(parseAliasConfig('{"compilerOptions":{}}', '/proj')).toBeUndefined();
        expect(parseAliasConfig('not json', '/proj')).toBeUndefined();
    });
});

describe('aliasCandidates', () => {
    it('expands the longest matching pattern first', () => {
        const map = parseAliasConfig(
            '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"],"@/ui/*":["ui/*"]}}}',
            '/proj',
        )!;
        expect(aliasCandidates('@/ui/Button', map)).toEqual([
            path.resolve('/proj', 'ui/Button'),
            path.resolve('/proj', 'src/ui/Button'),
        ]);
    });

    it('resolves exact patterns', () => {
        const exact = parseAliasConfig(
            '{"compilerOptions":{"baseUrl":".","paths":{"config":["src/config.ts"]}}}',
            '/proj',
        )!;
        expect(aliasCandidates('config', exact)).toEqual([path.resolve('/proj', 'src/config.ts')]);
    });

    it('falls back to baseUrl for bare specifiers', () => {
        const base = parseAliasConfig('{"compilerOptions":{"baseUrl":"."}}', '/proj')!;
        expect(aliasCandidates('src/util', base)).toEqual([path.resolve('/proj', 'src/util')]);
    });

    it('ignores unrelated specifiers', () => {
        const map = parseAliasConfig('{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}', '/proj')!;
        expect(aliasCandidates('react', map)).toEqual([path.resolve('/proj', 'react')]);
    });
});

describe('stripTrailingCommas', () => {
    it('drops commas before } and ] but not inside strings', () => {
        const src = '{"a": [1, 2,], "b": {"c": ",}",},}';
        expect(JSON.parse(stripTrailingCommas(src))).toEqual({ a: [1, 2], b: { c: ',}' } });
    });
});

describe('loadAliasConfig', () => {
    let dir: string;
    const write = (rel: string, text: string) => {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), text);
    };

    beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-tsconfig-')); });
    afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    it('inherits baseUrl relative to the config that declares it', () => {
        write('configs/base.json', '{"compilerOptions":{"baseUrl":"..","paths":{"@/*":["src/*"]}}}');
        write('tsconfig.json', '{"extends":"./configs/base"}');
        expect(loadAliasConfig(path.join(dir, 'tsconfig.json'))).toEqual({ baseUrl: dir, paths: { '@/*': ['src/*'] } });
    });

    it('lets the extending file override paths, and later extends entries win', () => {
        write('a.json', '{"compilerOptions":{"paths":{"a/*":["a/*"]}}}');
        write('b.json', '{"compilerOptions":{"baseUrl":"lib"}}');
        write('tsconfig.json', '{"extends":["./a.json","./b.json"],"compilerOptions":{"paths":{"own/*":["own/*"]}}}');
        expect(loadAliasConfig(path.join(dir, 'tsconfig.json'))).toEqual({
            baseUrl: path.join(dir, 'lib'),
            paths: { 'own/*': ['own/*'] },
        });
    });

    it('finds an extends target published as a package', () => {
        write('node_modules/@acme/tsconfig/tsconfig.json', '{"compilerOptions":{"baseUrl":"."}}');
        write('tsconfig.json', '{"extends":"@acme/tsconfig"}');
        expect(loadAliasConfig(path.join(dir, 'tsconfig.json'))?.baseUrl)
            .toBe(path.join(dir, 'node_modules', '@acme', 'tsconfig'));
    });

    it('survives an extends cycle', () => {
        write('tsconfig.json', '{"extends":"./tsconfig.json","compilerOptions":{"baseUrl":"."}}');
        expect(loadAliasConfig(path.join(dir, 'tsconfig.json'))?.baseUrl).toBe(dir);
    });
});
