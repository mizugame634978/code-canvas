import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureGraph } from './fixtureGraph';

// End to end over fixtures/ts-basic: every module-specifier style listed in
// that fixture's README must resolve to the file TypeScript would pick.
let result: Awaited<ReturnType<typeof fixtureGraph>>;

beforeAll(async () => {
    result = await fixtureGraph('ts-basic');
});

describe('fixtures/ts-basic', () => {
    // Namespace, dynamic, side-effect and `export *` imports carry no symbol name, hence [].
    it('draws every import edge, with the imported names, and nothing else', () => {
        expect(result.edges).toEqual([
            'src/app.tsx <- src/components/index.ts [Button, ButtonProps]',
            'src/app.tsx <- src/types.ts [User]',
            'src/components/Card.tsx <- src/lib/date.ts [formatDate]',
            'src/components/index.ts <- src/components/Button.tsx [Button, ButtonProps]',
            'src/components/index.ts <- src/components/Card.tsx []',
            'src/lazy.ts <- src/config.ts [config]',
            'src/lib/index.ts <- src/lib/date.ts [formatDate]',
            'src/lib/legacy.js <- src/lib/date.ts [formatDate]',
            'src/main.ts <- src/app.tsx [App]',
            'src/main.ts <- src/config.ts [config]',
            'src/main.ts <- src/lazy.ts []',
            'src/main.ts <- src/lib/index.ts []',
            'src/main.ts <- src/polyfill.ts []',
        ]);
    });

    it('ignores an import that is commented out', () => {
        expect(result.isolated).toEqual(['src/ghost.ts']);
    });
});
