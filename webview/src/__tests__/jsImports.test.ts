import { describe, expect, it } from 'vitest';
import { blankJsComments, parseJsTsImports } from '../../../extension/src/imports';

describe('blankJsComments', () => {
    it('blanks comments without moving any line', () => {
        const src = 'a // x\n/* y\nz */ b';
        const out = blankJsComments(src);
        expect(out.length).toBe(src.length);
        expect(out.split('\n')).toEqual(['a     ', '    ', '     b']);
    });

    it('leaves strings and template literals alone', () => {
        const src = "const u = 'http://x'; const t = `/* not a comment */`; // gone";
        expect(blankJsComments(src).trimEnd()).toBe("const u = 'http://x'; const t = `/* not a comment */`;");
    });
});

describe('parseJsTsImports', () => {
    it('ignores commented-out imports and keeps line numbers of the live ones', () => {
        const src = [
            "// import { a } from './a';",
            '/*',
            "import { b } from './b';",
            '*/',
            "import { c } from './c';",
        ].join('\n');
        const specs = parseJsTsImports(src);
        expect(specs.map(s => [s.spec, s.line])).toEqual([['./c', 4]]);
    });
});
