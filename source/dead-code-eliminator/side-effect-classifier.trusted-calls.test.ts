import assert from 'node:assert';
import { suite, test } from 'mocha';
import { classify } from '../test-libraries/side-effect-classifier-test-support.ts';

suite('side-effect-classifier trusted calls', function () {
    suite('side-effect-classifier built-in construction arguments', function () {
        for (
            const construction of [
                'new Map()',
                'new Map(null)',
                'new Map([ [ 1, 2 ] ])',
                'new Set(undefined)',
                'new WeakMap()',
                'new WeakSet()',
                'new TextEncoder()',
                'new TextDecoder()',
                'new globalThis["Set"]()'
            ]
        ) {
            test(`treats a built-in construction with safe arguments as pure: ${construction}`, function () {
                assert.deepStrictEqual(classify(`const x = ${construction};`), []);
            });
        }

        for (
            const construction of [
                'new Map([ [ 1, 2 ] ])',
                'new Set([ 1 ])'
            ]
        ) {
            test(`treats ${construction} as impure when the bundle patches the array iterator`, function () {
                assert.deepStrictEqual(
                    classify(`Array.prototype[Symbol.iterator] = replacement;\nconst x = ${construction};`),
                    [ { line: 1, kind: 'expression statement' }, { line: 2, kind: 'variable initializer' } ]
                );
            });
        }

        for (const name of [ 'Set', 'Map', 'WeakSet', 'WeakMap', 'TextEncoder', 'TextDecoder' ]) {
            test(`treats new ${name}() as impure when the bundle replaces the constructor`, function () {
                assert.deepStrictEqual(
                    classify(`globalThis.${name} = replacement;\nconst x = new ${name}();`),
                    [ { line: 1, kind: 'expression statement' }, { line: 2, kind: 'variable initializer' } ]
                );
            });
        }

        for (const construction of [ 'new Intl.Collator()', 'new (factory())()', 'new Set(...values)' ]) {
            test(`treats a construction without a known built-in as impure: ${construction}`, function () {
                assert.deepStrictEqual(classify(`const x = ${construction};`), [ {
                    line: 1,
                    kind: 'variable initializer'
                } ]);
            });
        }
    });

    suite('side-effect-classifier built-in constructions', function () {
        test('treats a built-in Set construction as pure without constructor trust settings', function () {
            assert.deepStrictEqual(classify('const x = new Set([1, 2, 3]);', { enabled: true }), []);
        });

        for (
            const construction of [
                'new Set(compute())',
                'new Set({})',
                'new Map([ 1 ])',
                'new WeakSet([ {} ])',
                'new TextDecoder("latin1")',
                'new Date()'
            ]
        ) {
            test(`treats a construction that may throw or run code as impure: ${construction}`, function () {
                assert.deepStrictEqual(classify(`const x = ${construction};`), [ {
                    line: 1,
                    kind: 'variable initializer'
                } ]);
            });
        }

        for (
            const [ patch, construction ] of [
                [ 'Set.prototype.add', 'new Set([ 1 ])' ],
                [ 'Map.prototype.set', 'new Map([ [ 1, 2 ] ])' ]
            ]
        ) {
            test(`treats ${construction} as impure when the bundle patches ${patch}`, function () {
                assert.deepStrictEqual(
                    classify(`${patch} = replacement;\nconst x = ${construction};`),
                    [ { line: 1, kind: 'expression statement' }, { line: 2, kind: 'variable initializer' } ]
                );
            });
        }
    });

    suite('side-effect-classifier intrinsic calls', function () {
        for (const creation of [ 'Symbol()', 'Symbol("marker")', 'Symbol(1)', 'globalThis.Symbol("marker")' ]) {
            test(`treats an intact global ${creation} as pure`, function () {
                assert.deepStrictEqual(classify(`const x = ${creation};`), []);
            });
        }

        for (
            const creation of [
                'Symbol({ toString() { return "marker"; } })',
                'Symbol(compute())',
                'Symbol(...descriptions)',
                'Symbol(Symbol())'
            ]
        ) {
            test(`keeps a Symbol call with a coercing or unknown description observable: ${creation}`, function () {
                assert.deepStrictEqual(classify(`const x = ${creation};`), [ {
                    line: 1,
                    kind: 'variable initializer'
                } ]);
            });
        }

        test('keeps a Symbol call observable when the bundle replaces Symbol', function () {
            assert.deepStrictEqual(classify('globalThis.Symbol = replacement;\nconst x = Symbol("marker");'), [
                { line: 1, kind: 'expression statement' },
                { line: 2, kind: 'variable initializer' }
            ]);
        });
    });

    suite('side-effect-classifier trusted imports', function () {
        test('treats a const with a call expression as impure', function () {
            assert.deepStrictEqual(classify('const x = compute();'), [ { line: 1, kind: 'variable initializer' } ]);
        });

        test('treats a const with a trusted imported call as pure', function () {
            assert.deepStrictEqual(
                classify('import { bold } from "formatting-library"; const x = bold("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'formatting-library', imports: [ 'bold' ] } ]
                }),
                []
            );
        });

        test('preserves argument iteration even when the callee is trusted', function () {
            assert.deepStrictEqual(
                classify(
                    'import { bold } from "formatting-library"; const x = (((bold as typeof bold))!)(...[\'hi\']);',
                    {
                        enabled: true,
                        pureImports: [ { from: 'formatting-library', imports: [ 'bold' ] } ]
                    }
                ),
                [ { line: 1, kind: 'variable initializer' } ]
            );
        });

        test('treats a const with a trusted namespace import call as pure', function () {
            assert.deepStrictEqual(
                classify('import * as colors from "formatting-library"; const x = colors.green("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'formatting-library' } ]
                }),
                []
            );
        });

        test('treats a const with a trusted namespace import call as pure when the allow-list names the accessed member', function () {
            assert.deepStrictEqual(
                classify('import * as colors from "formatting-library"; const x = colors.green("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'formatting-library', imports: [ 'green' ] } ]
                }),
                []
            );
        });

        test('treats a namespace import call chain as impure when only a later accessed member is trusted', function () {
            assert.deepStrictEqual(
                classify('import * as colors from "formatting-library"; const x = colors.bold.green("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'formatting-library', imports: [ 'green' ] } ]
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
                classify('import { bold } from "formatting-library"; const x = bold("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'formatting-library', imports: [ 'default' ] } ]
                }),
                [ { line: 1, kind: 'variable initializer' } ]
            );
        });

        test('treats a const with a trusted imported call as pure when a later trust rule matches', function () {
            assert.deepStrictEqual(
                classify('import { bold } from "formatting-library"; const x = bold("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'trusted-formatter' }, { from: 'formatting-library', imports: [ 'bold' ] } ]
                }),
                []
            );
        });

        test('treats a const with a trusted namespace builder call chain as pure', function () {
            assert.deepStrictEqual(
                classify(
                    'import { builder } from "builder-library"; const x = builder.create().configure(builder.option(1));',
                    {
                        enabled: true,
                        pureImports: [ { from: 'builder-library' } ]
                    }
                ),
                []
            );
        });

        test('treats an untrusted imported call as impure', function () {
            assert.deepStrictEqual(
                classify('import { bold } from "formatting-library"; const x = bold("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'formatting-library', imports: [ 'green' ] } ]
                }),
                [ { line: 1, kind: 'variable initializer' } ]
            );
        });

        test('treats a namespace import call as impure when the module is not trusted', function () {
            assert.deepStrictEqual(
                classify('import * as colors from "formatting-library"; const x = colors.green("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'trusted-formatter' } ]
                }),
                [ { line: 1, kind: 'variable initializer' } ]
            );
        });

        test('treats a const with an imported call as impure when no pure import settings are configured', function () {
            assert.deepStrictEqual(
                classify('import { bold } from "formatting-library"; const x = bold("hi");', { enabled: true }),
                [ { line: 1, kind: 'variable initializer' } ]
            );
        });

        test('treats a const with an imported call as impure when purity settings are omitted entirely', function () {
            assert.deepStrictEqual(classify('import { bold } from "formatting-library"; const x = bold("hi");'), [
                { line: 1, kind: 'variable initializer' }
            ]);
        });
    });

    suite('side-effect-classifier constructors and properties', function () {
        test('treats a trusted imported call with an impure argument as impure', function () {
            assert.deepStrictEqual(
                classify('import { bold } from "formatting-library"; const x = bold(compute());', {
                    enabled: true,
                    pureImports: [ { from: 'formatting-library', imports: [ 'bold' ] } ]
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
                classify('import * as colors from "formatting-library"; const x = colors["green"]("hi");', {
                    enabled: true,
                    pureImports: [ { from: 'formatting-library' } ]
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

        for (
            const shadowing of [
                'class Set { constructor() { console.log("created"); } }',
                'import { Set } from "./effects.js";',
                'const Set = createSet();',
                'function Set() { console.log("created"); }'
            ]
        ) {
            test(`treats a trusted constructor name as impure when shadowed by: ${shadowing}`, function () {
                assert.deepStrictEqual(
                    classify(`${shadowing}\nconst x = new Set();`, { enabled: true, pureConstructors: [ 'Set' ] })
                        .filter(function isOnSecondLine(effect) {
                            return effect.line === 2;
                        }),
                    [ { line: 2, kind: 'variable initializer' } ]
                );
            });
        }

        test('treats a trusted constructor name as impure when direct eval can declare it', function () {
            assert.deepStrictEqual(
                classify('eval(code);\nconst x = new Set();', { enabled: true, pureConstructors: [ 'Set' ] }),
                [ { line: 1, kind: 'expression statement' }, { line: 2, kind: 'variable initializer' } ]
            );
        });
    });
});
