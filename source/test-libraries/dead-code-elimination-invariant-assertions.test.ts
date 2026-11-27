import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { AnalyzedBundle, AnalyzedBundleResource } from '../dead-code-eliminator/analyzed-bundle.ts';
import { analyzedBundle, analyzedBundleResource, externalDependency } from './bundle-fixtures.ts';
import { assertValidDeadCodeEliminationOutput } from './dead-code-elimination-invariant-assertions.ts';

function bundleWith(contents: readonly AnalyzedBundleResource[]): AnalyzedBundle {
    return analyzedBundle({ name: 'package', contents });
}

function assertInvariantFailure(bundle: AnalyzedBundle, pattern: RegExp): void {
    assert.throws(function () {
        assertValidDeadCodeEliminationOutput('case', [ bundle ]);
    }, pattern);
}

suite('dead code elimination invariant assertions', function () {
    test('accepts a valid named runtime import graph', function () {
        assertValidDeadCodeEliminationOutput('case', [
            bundleWith([
                analyzedBundleResource('/source/index.js', {
                    targetFilePath: 'index.js',
                    content: 'import { value } from "./value.js";\nexport const api = value;\n'
                }),
                analyzedBundleResource('/source/value.js', {
                    targetFilePath: 'value.js',
                    content: 'export const value = 1;\n'
                })
            ])
        ]);
    });

    test('rejects duplicate emitted target paths within a bundle', function () {
        assertInvariantFailure(
            bundleWith([
                analyzedBundleResource('/source/a.js', {
                    targetFilePath: 'index.js',
                    content: 'export const a = 1;\n'
                }),
                analyzedBundleResource('/source/b.js', {
                    targetFilePath: 'index.js',
                    content: 'export const b = 1;\n'
                })
            ]),
            /duplicate emitted target path index\.js/u
        );
    });

    test('rejects a missing runtime import target', function () {
        assertInvariantFailure(
            bundleWith([
                analyzedBundleResource('/source/index.js', {
                    targetFilePath: 'index.js',
                    content: 'import { value } from "./missing.js";\nexport const api = value;\n'
                })
            ]),
            /index\.js imports \.\/missing\.js in runtime mode, but no emitted target remains/u
        );
    });

    test('rejects a runtime import that resolves only to a declaration target', function () {
        assertInvariantFailure(
            bundleWith([
                analyzedBundleResource('/source/index.js', {
                    targetFilePath: 'index.js',
                    content: 'import { value } from "./value.js";\nexport const api = value;\n'
                }),
                analyzedBundleResource('/source/value.d.ts', {
                    targetFilePath: 'value.d.ts',
                    content: 'export declare const value: number;\n'
                })
            ]),
            /only declaration targets remain: value\.d\.ts/u
        );
    });

    test('rejects missing named and default exports', function () {
        const bundle = bundleWith([
            analyzedBundleResource('/source/index.js', {
                targetFilePath: 'index.js',
                content: [
                    'import { missing } from "./named.js";',
                    'import fallback from "./default.js";',
                    'export const api = [ missing, fallback ];',
                    ''
                ]
                    .join('\n')
            }),
            analyzedBundleResource('/source/named.js', {
                targetFilePath: 'named.js',
                content: 'export const value = 1;\n'
            }),
            analyzedBundleResource('/source/default.js', {
                targetFilePath: 'default.js',
                content: 'export const value = 1;\n'
            })
        ]);
        assertInvariantFailure(
            bundle,
            /named\.js does not export it[\s\S]*default\.js does not export it/u
        );
    });

    test('rejects dangling local export declarations', function () {
        assertInvariantFailure(
            bundleWith([
                analyzedBundleResource('/source/imported-expression-origin.ts', {
                    targetFilePath: 'dead-code-eliminator/imported-expression-origin.js',
                    content: 'export { arePureCallArguments };\n'
                })
            ]),
            /imported-expression-origin\.js exports local arePureCallArguments, but no local binding remains/u
        );
    });

    test('accepts declaration imports resolved through declaration targets', function () {
        assertValidDeadCodeEliminationOutput('case', [
            bundleWith([
                analyzedBundleResource('/source/index.d.ts', {
                    targetFilePath: 'index.d.ts',
                    content: 'import type { Api } from "./types.js";\nexport type Public = Api;\n'
                }),
                analyzedBundleResource('/source/types.d.ts', {
                    targetFilePath: 'types.d.ts',
                    content: 'export type Api = string;\n'
                })
            ])
        ]);
        assertValidDeadCodeEliminationOutput('case', [
            bundleWith([
                analyzedBundleResource('/source/index.d.ts', {
                    targetFilePath: 'index.d.ts',
                    content: 'import type { Api } from "./types.ts";\nexport type Public = Api;\n'
                }),
                analyzedBundleResource('/source/types.d.ts', {
                    targetFilePath: 'types.d.ts',
                    content: 'export type Api = string;\n'
                })
            ])
        ]);
    });

    test('rejects dependency metadata that references a pruned target file', function () {
        const analyzedRootBundle = analyzedBundle({
            name: 'package',
            contents: [ analyzedBundleResource('/source/index.js', {
                targetFilePath: 'index.js',
                content: 'export const api = 1;\n'
            }) ],
            externalDependencies: new Map([ [ 'dep', externalDependency('dep', [ '/source/missing.js' ]) ] ])
        });
        assertInvariantFailure(
            analyzedRootBundle,
            /external dependency dep references pruned target file missing\.js/u
        );
    });

    test('rejects direct dependencies from emitted code to pruned target files', function () {
        const bundle = bundleWith([
            analyzedBundleResource('/source/index.js', {
                targetFilePath: 'index.js',
                content: 'export const api = 1;\n',
                directDependencies: new Set([ 'dead.js' ])
            })
        ]);
        assertInvariantFailure(
            bundle,
            /index\.js has direct dependency on pruned target file dead\.js/u
        );
    });

    test('checks asset imports by target existence only', function () {
        assertValidDeadCodeEliminationOutput('case', [
            bundleWith([
                analyzedBundleResource('/source/index.js', {
                    targetFilePath: 'index.js',
                    content: 'import data from "./data.json" with { type: "json" };\nexport default data;\n'
                }),
                analyzedBundleResource('/source/data.json', {
                    targetFilePath: 'data.json',
                    content: '{"value":1}\n'
                })
            ])
        ]);
    });
});
