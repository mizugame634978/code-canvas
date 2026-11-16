import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildCsTypeIndex } from '../../../extension/src/csResolve';
import { blankXmlComments, resolveXamlReferences } from '../../../extension/src/xamlResolve';

// A project on disk, because `/`-rooted and pack URIs resolve against the
// folder holding the .csproj.
let proj: string;
const p = (rel: string) => path.join(proj, ...rel.split('/'));
const write = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(p(rel)), { recursive: true });
    fs.writeFileSync(p(rel), text);
};

beforeAll(() => {
    proj = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-xaml-'));
    write('App.csproj', '<Project />');
    write('Themes/Dark.xaml', '<ResourceDictionary />');
    write('Themes/Light.xaml', '<ResourceDictionary />');
    write('Views/Sub/Card.xaml', '<UserControl />');
});

afterAll(() => {
    fs.rmSync(proj, { recursive: true, force: true });
});

const index = buildCsTypeIndex([
    ['Vm.cs', 'namespace App.ViewModels;\npublic class ShellViewModel {}\npublic class ItemViewModel {}'],
    ['Conv.cs', 'namespace App.Converters;\npublic class BoolToVis {}'],
]);
const isFile = (f: string) => fs.statSync(f, { throwIfNoEntry: false })?.isFile() ?? false;
// Type hits name the (relative) files given to the index; XAML hits are absolute paths in `proj`.
const show = (f: string) => (path.isAbsolute(f) ? path.relative(proj, f).replace(/\\/g, '/') : f);
const refs = (rel: string, src: string) => resolveXamlReferences(p(rel), src, index, isFile)
    .map(h => `${h.bindings[0].name}@${show(h.file)}:${h.line}`);

describe('blankXmlComments', () => {
    it('blanks comments and keeps lines', () => {
        expect(blankXmlComments('a<!-- x\ny -->b')).toBe('a      \n     b');
    });
});

describe('resolveXamlReferences', () => {
    it('resolves clr-namespace and using: prefixes in elements and attribute values', () => {
        const src = [
            '<UserControl xmlns:vm="clr-namespace:App.ViewModels;assembly=App"',
            '             xmlns:c="using:App.Converters">',
            '  <UserControl.Resources><c:BoolToVis x:Key="b" /></UserControl.Resources>',
            '  <DataTemplate DataType="vm:ItemViewModel" />',
            '  <vm:ShellViewModel.Title />',
            '</UserControl>',
        ].join('\n');
        expect(refs('Views/Shell.xaml', src)).toEqual(['BoolToVis@Conv.cs:2', 'ItemViewModel@Vm.cs:3', 'ShellViewModel@Vm.cs:4']);
    });

    it('resolves relative, project-rooted, pack and component paths to XAML files', () => {
        const src = [
            '<ResourceDictionary Source="Sub/Card.xaml" />',
            '<ResourceDictionary Source="/Themes/Dark.xaml" />',
            '<ResourceDictionary Source="pack://application:,,,/App;component/Themes/Light.xaml" />',
            '<ResourceDictionary Source="Missing.xaml" />',
        ].join('\n');
        expect(refs('Views/Page.xaml', src)).toEqual([
            'Card.xaml@Views/Sub/Card.xaml:0',
            'Dark.xaml@Themes/Dark.xaml:1',
            'Light.xaml@Themes/Light.xaml:2',
        ]);
    });

    it('ignores commented-out markup and unknown prefixes', () => {
        const src = '<Grid xmlns:vm="clr-namespace:App.ViewModels" xmlns:x="x">\n<!-- <vm:ShellViewModel /> -->\n<x:Null /></Grid>';
        expect(refs('Views/Grid.xaml', src)).toEqual([]);
    });
});
