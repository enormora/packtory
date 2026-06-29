import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { extractTopLevelBindings } from './binding-extractor.ts';

function names(content: string): readonly string[] {
    const project = createProject({ withFiles: [ { filePath: 'index.ts', content } ] });
    return extractTopLevelBindings(project.getSourceFileOrThrow('index.ts')).map(function (binding) {
        return binding.name;
    });
}

function descriptors(content: string): readonly { readonly name: string; readonly isExported: boolean; }[] {
    const project = createProject({ withFiles: [ { filePath: 'index.ts', content } ] });
    return extractTopLevelBindings(project.getSourceFileOrThrow('index.ts')).map(function (binding) {
        return { name: binding.name, isExported: binding.isExported };
    });
}

suite('binding-extractor', function () {
    suite('named declaration bindings', function () {
        test('extracts a function declaration name', function () {
            assert.deepStrictEqual(names('function foo() {}'), [ 'foo' ]);
        });

        test('extracts a class declaration name', function () {
            assert.deepStrictEqual(names('class Foo {}'), [ 'Foo' ]);
        });

        test('extracts an interface declaration name', function () {
            assert.deepStrictEqual(names('interface Foo {}'), [ 'Foo' ]);
        });

        test('extracts a type alias name', function () {
            assert.deepStrictEqual(names('type Foo = string;'), [ 'Foo' ]);
        });

        test('extracts an enum declaration name', function () {
            assert.deepStrictEqual(names('enum Foo { A }'), [ 'Foo' ]);
        });

        test('extracts a namespace declaration name', function () {
            assert.deepStrictEqual(names('namespace Foo {}'), [ 'Foo' ]);
        });

        test('extracts every variable declarator name from a single statement', function () {
            assert.deepStrictEqual(names('const a = 1, b = 2, c = 3;'), [ 'a', 'b', 'c' ]);
        });

        test('extracts every bound identifier from an object destructuring declaration', function () {
            assert.deepStrictEqual(names('const { a, b: c, ...rest } = value;'), [ 'a', 'c', 'rest' ]);
        });
    });

    suite('destructuring and import bindings', function () {
        test('extracts every bound identifier from an array destructuring declaration', function () {
            assert.deepStrictEqual(names('const [first, , third, ...rest] = value;'), [ 'first', 'third', 'rest' ]);
        });

        test('extracts the local name of a default import', function () {
            assert.deepStrictEqual(names('import foo from "./other";'), [ 'foo' ]);
        });

        test('extracts the local name of a namespace import', function () {
            assert.deepStrictEqual(names('import * as ns from "./other";'), [ 'ns' ]);
        });

        test('extracts named import bindings using their local names', function () {
            assert.deepStrictEqual(names('import { foo, bar } from "./other";'), [ 'foo', 'bar' ]);
        });

        test('uses the alias when a named import is renamed', function () {
            assert.deepStrictEqual(names('import { foo as bar } from "./other";'), [ 'bar' ]);
        });

        test('extracts default plus named imports together', function () {
            assert.deepStrictEqual(names('import def, { foo } from "./other";'), [ 'def', 'foo' ]);
        });

        test('returns no bindings for an empty file', function () {
            assert.deepStrictEqual(names(''), []);
        });

        test('skips a default-exported anonymous function declaration without a name', function () {
            assert.deepStrictEqual(names('export default function () {}'), []);
        });
    });

    suite('export metadata for declarations', function () {
        test('skips a default-exported anonymous class declaration without a name', function () {
            assert.deepStrictEqual(names('export default class {}'), []);
        });

        test('returns no bindings for a file with only impure top-level code', function () {
            assert.deepStrictEqual(names('console.log("hi");'), []);
        });

        test('marks an exported function as exported', function () {
            assert.deepStrictEqual(descriptors('export function foo() {}'), [ { name: 'foo', isExported: true } ]);
        });

        test('marks a default-exported function as exported', function () {
            assert.deepStrictEqual(descriptors('export default function foo() {}'), [ {
                name: 'foo',
                isExported: true
            } ]);
        });

        test('marks an ESM default export assignment as exported', function () {
            assert.deepStrictEqual(descriptors('const foo = 1;\nexport default foo;'), [
                { name: 'foo', isExported: false },
                { name: 'default', isExported: true }
            ]);
        });

        test('skips CommonJS export-equals assignments because they do not create an ESM binding', function () {
            assert.deepStrictEqual(names('const foo = 1;\nexport = foo;'), [ 'foo' ]);
        });

        test('marks an exported class as exported', function () {
            assert.deepStrictEqual(descriptors('export class Foo {}'), [ { name: 'Foo', isExported: true } ]);
        });

        test('marks every declarator of an exported variable statement as exported', function () {
            assert.deepStrictEqual(descriptors('export const a = 1, b = 2;'), [
                { name: 'a', isExported: true },
                { name: 'b', isExported: true }
            ]);
        });
    });

    suite('export metadata for bindings and imports', function () {
        test('marks every bound identifier of an exported destructuring statement as exported', function () {
            assert.deepStrictEqual(descriptors('export const { a, b: c } = value;'), [
                { name: 'a', isExported: true },
                { name: 'c', isExported: true }
            ]);
        });

        test('marks an unexported function as not exported', function () {
            assert.deepStrictEqual(descriptors('function foo() {}'), [ { name: 'foo', isExported: false } ]);
        });

        test('marks imports as not exported', function () {
            assert.deepStrictEqual(descriptors('import { foo } from "./other";'), [ {
                name: 'foo',
                isExported: false
            } ]);
        });

        test('marks a default import as not exported', function () {
            assert.deepStrictEqual(descriptors('import foo from "./other";'), [ { name: 'foo', isExported: false } ]);
        });

        test('marks a namespace import as not exported', function () {
            assert.deepStrictEqual(descriptors('import * as ns from "./other";'), [ {
                name: 'ns',
                isExported: false
            } ]);
        });

        test('extracts bindings from a mixed file in declaration order', function () {
            assert.deepStrictEqual(
                names(
                    [
                        'import { dep } from "./other";',
                        'const helper = 1;',
                        'function pub() {}',
                        'export class Public {}',
                        'type Alias = string;'
                    ]
                        .join('\n')
                ),
                [ 'dep', 'helper', 'pub', 'Public', 'Alias' ]
            );
        });
    });
});
