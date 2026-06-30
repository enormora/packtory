import assert from 'node:assert';
import { suite, test } from 'mocha';
import { classify } from './side-effect-classifier.test-support.ts';

suite('side-effect-classifier trusted calls', function () {
    suite('side-effect-classifier trusted imports', function () {
        test('treats a const with a call expression as impure', function () {
            assert.deepStrictEqual(classify('const x = compute();'), [ { line: 1, kind: 'variable initializer' } ]);
        });

        test('treats a const with a Symbol call as pure', function () {
            assert.deepStrictEqual(classify('const x = Symbol("marker");'), []);
        });

        test('treats a const with a trusted imported call as pure', function () {
            assert.deepStrictEqual(
                classify('import { bold } from "yoctocolors"; const x = bold("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'yoctocolors', imports: [ 'bold' ] } ]
                }),
                []
            );
        });

        test('treats a const with a wrapped trusted imported call and spread arguments as pure', function () {
            assert.deepStrictEqual(
                classify('import { bold } from "yoctocolors"; const x = (((bold as typeof bold))!)(...[\'hi\']);', {
                    enabled: true,
                    pureImports: [ { from: 'yoctocolors', imports: [ 'bold' ] } ]
                }),
                []
            );
        });

        test('treats a const with a trusted namespace import call as pure', function () {
            assert.deepStrictEqual(
                classify('import * as colors from "yoctocolors"; const x = colors.green("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'yoctocolors' } ]
                }),
                []
            );
        });

        test('treats a const with a trusted namespace import call as pure when the allow-list names the accessed member', function () {
            assert.deepStrictEqual(
                classify('import * as colors from "yoctocolors"; const x = colors.green("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'yoctocolors', imports: [ 'green' ] } ]
                }),
                []
            );
        });

        test('treats a namespace import call chain as impure when only a later accessed member is trusted', function () {
            assert.deepStrictEqual(
                classify('import * as colors from "yoctocolors"; const x = colors.bold.green("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'yoctocolors', imports: [ 'green' ] } ]
                }),
                [ { line: 1, kind: 'variable initializer' } ]
            );
        });
    });

    suite('side-effect-classifier untrusted imports', function () {
        test('treats a const with a trusted default import call as pure', function () {
            assert.deepStrictEqual(
                classify('import format from "trusted-formatter"; const x = format("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'trusted-formatter', imports: [ 'default' ] } ]
                }),
                []
            );
        });

        test('treats a const with a named import as impure when only default imports are trusted', function () {
            assert.deepStrictEqual(
                classify('import { bold } from "yoctocolors"; const x = bold("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'yoctocolors', imports: [ 'default' ] } ]
                }),
                [ { line: 1, kind: 'variable initializer' } ]
            );
        });

        test('treats a const with a trusted imported call as pure when a later trust rule matches', function () {
            assert.deepStrictEqual(
                classify('import { bold } from "yoctocolors"; const x = bold("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'trusted-formatter' }, { from: 'yoctocolors', imports: [ 'bold' ] } ]
                }),
                []
            );
        });

        test('treats a const with a trusted namespace builder call chain as pure', function () {
            assert.deepStrictEqual(
                classify('import { z } from "zod/mini"; const x = z.string().check(z.minLength(1));', {
                    enabled: true,
                    pureImports: [ { from: 'zod/mini' } ]
                }),
                []
            );
        });

        test('treats an untrusted imported call as impure', function () {
            assert.deepStrictEqual(
                classify('import { bold } from "yoctocolors"; const x = bold("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'yoctocolors', imports: [ 'green' ] } ]
                }),
                [ { line: 1, kind: 'variable initializer' } ]
            );
        });

        test('treats a namespace import call as impure when the module is not trusted', function () {
            assert.deepStrictEqual(
                classify('import * as colors from "yoctocolors"; const x = colors.green("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'trusted-formatter' } ]
                }),
                [ { line: 1, kind: 'variable initializer' } ]
            );
        });

        test('treats a const with an imported call as impure when no pure import settings are configured', function () {
            assert.deepStrictEqual(
                classify('import { bold } from "yoctocolors"; const x = bold("hi");', { enabled: true }),
                [ { line: 1, kind: 'variable initializer' } ]
            );
        });

        test('treats a const with an imported call as impure when purity settings are omitted entirely', function () {
            assert.deepStrictEqual(classify('import { bold } from "yoctocolors"; const x = bold("hi");'), [
                { line: 1, kind: 'variable initializer' }
            ]);
        });
    });

    suite('side-effect-classifier constructors and properties', function () {
        test('treats a trusted imported call with an impure argument as impure', function () {
            assert.deepStrictEqual(
                classify('import { bold } from "yoctocolors"; const x = bold(compute());', {
                    enabled: true,
                    pureImports: [ { from: 'yoctocolors', imports: [ 'bold' ] } ]
                }),
                [ { line: 1, kind: 'variable initializer' } ]
            );
        });

        test('treats a call through an untrusted property base as impure', function () {
            assert.deepStrictEqual(
                classify('declare const obj: { format(value: string): string }; const x = obj.format("hi");'),
                [ { line: 1, kind: 'variable initializer' } ]
            );
        });

        test('treats a call through an unsupported imported element access as impure', function () {
            assert.deepStrictEqual(
                classify('import * as colors from "yoctocolors"; const x = colors["green"]("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'yoctocolors' } ]
                }),
                [ { line: 1, kind: 'variable initializer' } ]
            );
        });

        test('treats a const with a default import as impure when only namespace members are trusted', function () {
            assert.deepStrictEqual(
                classify('import format from "trusted-formatter"; const x = format("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'trusted-formatter', imports: [ 'green' ] } ]
                }),
                [ { line: 1, kind: 'variable initializer' } ]
            );
        });

        test('treats a const with a new expression as impure', function () {
            assert.deepStrictEqual(classify('const x = new Date();'), [ { line: 1, kind: 'variable initializer' } ]);
        });

        test('treats a const with a trusted constructor call as pure', function () {
            assert.deepStrictEqual(
                classify('const x = new Set([1, 2, 3]);', {
                    enabled: true,
                    pureConstructors: [ 'Set' ]
                }),
                []
            );
        });

        test('treats a constructor call as impure when constructor trust settings are omitted', function () {
            assert.deepStrictEqual(classify('const x = new Set([1, 2, 3]);', { enabled: true }), [
                { line: 1, kind: 'variable initializer' }
            ]);
        });
    });
});
