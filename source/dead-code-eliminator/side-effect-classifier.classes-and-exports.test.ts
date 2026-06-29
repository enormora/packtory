import assert from 'node:assert';
import { suite, test } from 'mocha';
import { classify } from '../test-libraries/side-effect-classifier-test-support.ts';

suite('side-effect-classifier classes and exports', function () {
    suite('side-effect-classifier impure classes', function () {
        test('treats multiple variable declarators as impure if any initializer is impure', function () {
            assert.deepStrictEqual(classify('const a = 1, b = compute();'), [ {
                line: 1,
                kind: 'variable initializer'
            } ]);
        });

        test('treats a class with a method decorator as impure', function () {
            assert.deepStrictEqual(classify('function dec() { return () => {}; }\nclass Foo { @dec method() {} }'), [
                { line: 2, kind: 'class declaration' }
            ]);
        });

        test('treats a class with a class decorator as impure', function () {
            assert.deepStrictEqual(classify('function dec() { return () => {}; }\n@dec\nclass Foo {}'), [
                { line: 2, kind: 'class declaration' }
            ]);
        });

        test('treats a class with a static block as impure', function () {
            assert.deepStrictEqual(classify('class Foo { static { console.log("init"); } }'), [
                { line: 1, kind: 'class declaration' }
            ]);
        });

        test('treats a class with an impure static initializer as impure', function () {
            assert.deepStrictEqual(classify('class Foo { static x = compute(); }'), [
                { line: 1, kind: 'class declaration' }
            ]);
        });

        test('treats a class with a decorated set accessor as impure', function () {
            assert.deepStrictEqual(
                classify('function dec() { return () => {}; }\nclass Foo { @dec set value(v: number) {} }'),
                [ { line: 2, kind: 'class declaration' } ]
            );
        });

        test('does not flag a class whose only members are constructors', function () {
            assert.deepStrictEqual(classify('class Foo { constructor() {} }'), []);
        });
    });

    suite('side-effect-classifier pure classes', function () {
        test('treats a top-level debugger statement as an impure unknown statement', function () {
            assert.deepStrictEqual(classify('debugger;'), [ { line: 1, kind: 'unknown statement' } ]);
        });

        test('treats a class with a pure static initializer as pure', function () {
            assert.deepStrictEqual(classify('class Foo { static x = 1; }'), []);
        });

        test('treats a class with a static property without an initializer as pure', function () {
            assert.deepStrictEqual(classify('class Foo { static x: number; }'), []);
        });

        test('treats a class with a non-static impure initializer as pure (set per-instance)', function () {
            assert.deepStrictEqual(classify('class Foo { x = compute(); }'), []);
        });

        test('treats an export default class declaration as pure', function () {
            assert.deepStrictEqual(classify('export default class Foo {}'), []);
        });

        test('treats an export default function declaration as pure', function () {
            assert.deepStrictEqual(classify('export default function foo() {}'), []);
        });
    });

    suite('side-effect-classifier exports', function () {
        test('treats an export default of a pure expression as pure', function () {
            assert.deepStrictEqual(classify('export default 42;'), []);
        });

        test('treats an export default of a call expression as impure', function () {
            assert.deepStrictEqual(classify('declare function compute(): number; export default compute();'), [
                { line: 1, kind: 'export assignment' }
            ]);
        });

        test('treats an export-equals of a pure identifier as pure', function () {
            assert.deepStrictEqual(classify('declare const value: number; export = value;'), []);
        });

        test('treats an export-equals of a call as impure', function () {
            assert.deepStrictEqual(classify('declare function compute(): number; export = compute();'), [
                { line: 1, kind: 'export assignment' }
            ]);
        });

        test('reports the line of every impure statement', function () {
            const content = [ 'const a = 1;', 'console.log(a);', 'function foo() {}', 'compute();' ].join('\n');
            assert.deepStrictEqual(classify(content), [
                { line: 2, kind: 'expression statement' },
                { line: 4, kind: 'expression statement' }
            ]);
        });

        test('treats ambient declare statements as pure', function () {
            assert.deepStrictEqual(
                classify(
                    [ 'declare const x: number;', 'declare function foo(): void;', 'declare class Bar {}' ].join('\n')
                ),
                []
            );
        });
    });

    suite('side-effect-classifier multiline sources', function () {
        test('treats top-level await as impure (parsed inside an expression statement)', function () {
            const content = [ 'async function main() {', '  await Promise.resolve();', '}' ].join('\n');
            assert.deepStrictEqual(classify(content), []);
        });

        test('treats a const with an await initializer as impure', function () {
            const content = 'const x = await Promise.resolve(1);';
            assert.deepStrictEqual(classify(content), [ { line: 1, kind: 'variable initializer' } ]);
        });
    });
});
