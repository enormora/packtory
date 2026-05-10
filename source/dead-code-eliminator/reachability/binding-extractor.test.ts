import assert from 'node:assert';
import { test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { extractTopLevelBindings } from './binding-extractor.ts';

function names(content: string): readonly string[] {
    const project = createProject({ withFiles: [{ filePath: 'index.ts', content }] });
    return extractTopLevelBindings(project.getSourceFileOrThrow('index.ts')).map((binding) => {
        return binding.name;
    });
}

function descriptors(content: string): readonly { readonly name: string; readonly isExported: boolean }[] {
    const project = createProject({ withFiles: [{ filePath: 'index.ts', content }] });
    return extractTopLevelBindings(project.getSourceFileOrThrow('index.ts')).map((binding) => {
        return { name: binding.name, isExported: binding.isExported };
    });
}

test('extracts a function declaration name', () => {
    assert.deepStrictEqual(names('function foo() {}'), ['foo']);
});

test('extracts a class declaration name', () => {
    assert.deepStrictEqual(names('class Foo {}'), ['Foo']);
});

test('extracts an interface declaration name', () => {
    assert.deepStrictEqual(names('interface Foo {}'), ['Foo']);
});

test('extracts a type alias name', () => {
    assert.deepStrictEqual(names('type Foo = string;'), ['Foo']);
});

test('extracts an enum declaration name', () => {
    assert.deepStrictEqual(names('enum Foo { A }'), ['Foo']);
});

test('extracts a namespace declaration name', () => {
    assert.deepStrictEqual(names('namespace Foo {}'), ['Foo']);
});

test('extracts every variable declarator name from a single statement', () => {
    assert.deepStrictEqual(names('const a = 1, b = 2, c = 3;'), ['a', 'b', 'c']);
});

test('extracts the local name of a default import', () => {
    assert.deepStrictEqual(names('import foo from "./other";'), ['foo']);
});

test('extracts the local name of a namespace import', () => {
    assert.deepStrictEqual(names('import * as ns from "./other";'), ['ns']);
});

test('extracts named import bindings using their local names', () => {
    assert.deepStrictEqual(names('import { foo, bar } from "./other";'), ['foo', 'bar']);
});

test('uses the alias when a named import is renamed', () => {
    assert.deepStrictEqual(names('import { foo as bar } from "./other";'), ['bar']);
});

test('extracts default plus named imports together', () => {
    assert.deepStrictEqual(names('import def, { foo } from "./other";'), ['def', 'foo']);
});

test('returns no bindings for an empty file', () => {
    assert.deepStrictEqual(names(''), []);
});

test('skips a default-exported anonymous function declaration without a name', () => {
    assert.deepStrictEqual(names('export default function () {}'), []);
});

test('skips a default-exported anonymous class declaration without a name', () => {
    assert.deepStrictEqual(names('export default class {}'), []);
});

test('returns no bindings for a file with only impure top-level code', () => {
    assert.deepStrictEqual(names('console.log("hi");'), []);
});

test('marks an exported function as exported', () => {
    assert.deepStrictEqual(descriptors('export function foo() {}'), [{ name: 'foo', isExported: true }]);
});

test('marks a default-exported function as exported', () => {
    assert.deepStrictEqual(descriptors('export default function foo() {}'), [{ name: 'foo', isExported: true }]);
});

test('marks an exported class as exported', () => {
    assert.deepStrictEqual(descriptors('export class Foo {}'), [{ name: 'Foo', isExported: true }]);
});

test('marks every declarator of an exported variable statement as exported', () => {
    assert.deepStrictEqual(descriptors('export const a = 1, b = 2;'), [
        { name: 'a', isExported: true },
        { name: 'b', isExported: true }
    ]);
});

test('marks an unexported function as not exported', () => {
    assert.deepStrictEqual(descriptors('function foo() {}'), [{ name: 'foo', isExported: false }]);
});

test('marks imports as not exported', () => {
    assert.deepStrictEqual(descriptors('import { foo } from "./other";'), [{ name: 'foo', isExported: false }]);
});

test('marks a default import as not exported', () => {
    assert.deepStrictEqual(descriptors('import foo from "./other";'), [{ name: 'foo', isExported: false }]);
});

test('marks a namespace import as not exported', () => {
    assert.deepStrictEqual(descriptors('import * as ns from "./other";'), [{ name: 'ns', isExported: false }]);
});

test('extracts bindings from a mixed file in declaration order', () => {
    assert.deepStrictEqual(
        names(
            [
                'import { dep } from "./other";',
                'const helper = 1;',
                'function pub() {}',
                'export class Public {}',
                'type Alias = string;'
            ].join('\n')
        ),
        ['dep', 'helper', 'pub', 'Public', 'Alias']
    );
});
