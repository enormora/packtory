import assert from 'node:assert';
import { suite, test } from 'mocha';
import { classify } from './side-effect-classifier.test-support.ts';

suite('side-effect-classifier declarations and imports', function () {
    suite('side-effect-classifier declarations', function () {
        test('reports nothing for an empty file', function () {
            assert.deepStrictEqual(classify(''), []);
        });

        test('treats a function declaration as pure', function () {
            assert.deepStrictEqual(classify('function foo() { return 1; }'), []);
        });

        test('treats a class declaration without decorators as pure', function () {
            assert.deepStrictEqual(classify('class Foo { method() { return 1; } }'), []);
        });

        test('treats an interface declaration as pure', function () {
            assert.deepStrictEqual(classify('interface Foo { x: number; }'), []);
        });

        test('treats a type alias as pure', function () {
            assert.deepStrictEqual(classify('type Foo = string;'), []);
        });

        test('treats an enum declaration as pure', function () {
            assert.deepStrictEqual(classify('enum Foo { A, B }'), []);
        });

        test('treats a const enum declaration as pure', function () {
            assert.deepStrictEqual(classify('const enum Foo { A = 1 }'), []);
        });

        test('treats a namespace declaration as pure', function () {
            assert.deepStrictEqual(classify('namespace Foo { export const x: number = 1; }'), []);
        });
    });

    suite('side-effect-classifier imports', function () {
        test('treats an empty statement as pure', function () {
            assert.deepStrictEqual(classify(';'), []);
        });

        test('treats a re-export as pure', function () {
            assert.deepStrictEqual(classify('export { foo } from "./other";'), []);
        });

        test('treats a star re-export as pure', function () {
            assert.deepStrictEqual(classify('export * from "./other";'), []);
        });

        test('treats a regular ESM import as pure', function () {
            assert.deepStrictEqual(classify('import { foo } from "./other";'), []);
        });

        test('treats a default import as pure', function () {
            assert.deepStrictEqual(classify('import foo from "./other";'), []);
        });

        test('treats a namespace import as pure', function () {
            assert.deepStrictEqual(classify('import * as foo from "./other";'), []);
        });

        test('treats a bare import of a JS module as pure', function () {
            assert.deepStrictEqual(classify('import "./other";'), []);
        });

        test('flags a bare import of a CSS module as impure', function () {
            assert.deepStrictEqual(classify('import "./styles.css";'), [ { line: 1, kind: 'css import' } ]);
        });
    });
});
