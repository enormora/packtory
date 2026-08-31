import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { AnalyzedBundle, AnalyzedBundleResource } from '../dead-code-eliminator/analyzed-bundle.ts';
import { analyzedBundle, analyzedBundleResource, externalDependency } from './bundle-fixtures.ts';
import { assertValidDeadCodeEliminationOutput } from './dead-code-elimination-invariant-assertions.ts';

function resource(sourceFilePath: string, targetFilePath: string, content: string): AnalyzedBundleResource {
    return analyzedBundleResource(sourceFilePath, { content, targetFilePath });
}

function resourceWithDependencies(
    sourceFilePath: string,
    targetFilePath: string,
    content: string,
    directDependencies: ReadonlySet<string>
): AnalyzedBundleResource {
    return analyzedBundleResource(sourceFilePath, { content, targetFilePath, directDependencies });
}

function bundleWith(contents: readonly AnalyzedBundleResource[]): AnalyzedBundle {
    return analyzedBundle({ name: 'pkg', contents });
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
                resource(
                    '/src/index.js',
                    'index.js',
                    'import { value } from "./value.js";\nexport const api = value;\n'
                ),
                resource('/src/value.js', 'value.js', 'export const value = 1;\n')
            ])
        ]);
    });

    test('rejects duplicate emitted target paths within a bundle', function () {
        assertInvariantFailure(
            bundleWith([
                resource('/src/a.js', 'index.js', 'export const a = 1;\n'),
                resource('/src/b.js', 'index.js', 'export const b = 1;\n')
            ]),
            /duplicate emitted target path index\.js/u
        );
    });

    test('rejects a missing runtime import target', function () {
        assertInvariantFailure(
            bundleWith([
                resource(
                    '/src/index.js',
                    'index.js',
                    'import { value } from "./missing.js";\nexport const api = value;\n'
                )
            ]),
            /index\.js imports \.\/missing\.js in runtime mode, but no emitted target remains/u
        );
    });

    test('rejects a runtime import that resolves only to a declaration target', function () {
        assertInvariantFailure(
            bundleWith([
                resource(
                    '/src/index.js',
                    'index.js',
                    'import { value } from "./value.js";\nexport const api = value;\n'
                ),
                resource('/src/value.d.ts', 'value.d.ts', 'export declare const value: number;\n')
            ]),
            /only declaration targets remain: value\.d\.ts/u
        );
    });

    test('rejects missing named and default exports', function () {
        assertInvariantFailure(
            bundleWith([
                resource(
                    '/src/index.js',
                    'index.js',
                    [
                        'import { missing } from "./named.js";',
                        'import fallback from "./default.js";',
                        'export const api = [ missing, fallback ];',
                        ''
                    ]
                        .join('\n')
                ),
                resource('/src/named.js', 'named.js', 'export const value = 1;\n'),
                resource('/src/default.js', 'default.js', 'export const value = 1;\n')
            ]),
            /named\.js does not export it[\s\S]*default\.js does not export it/u
        );
    });

    test('accepts declaration imports resolved through declaration companions', function () {
        assertValidDeadCodeEliminationOutput('case', [
            bundleWith([
                resource(
                    '/src/index.d.ts',
                    'index.d.ts',
                    'import type { Api } from "./types.js";\nexport type Public = Api;\n'
                ),
                resource('/src/types.d.ts', 'types.d.ts', 'export type Api = string;\n')
            ])
        ]);
    });

    test('rejects dependency metadata that references a pruned source file', function () {
        assertInvariantFailure(
            analyzedBundle({
                name: 'pkg',
                contents: [ resource('/src/index.js', 'index.js', 'export const api = 1;\n') ],
                externalDependencies: new Map([ [ 'dep', externalDependency('dep', [ '/src/missing.js' ]) ] ])
            }),
            /external dependency dep references pruned source file \/src\/missing\.js/u
        );
    });

    test('rejects direct dependencies from emitted code to pruned source files', function () {
        assertInvariantFailure(
            bundleWith([
                resourceWithDependencies(
                    '/src/index.js',
                    'index.js',
                    'export const api = 1;\n',
                    new Set([ '/src/dead.js' ])
                )
            ]),
            /index\.js has direct dependency on pruned source file \/src\/dead\.js/u
        );
    });

    test('checks asset imports by target existence only', function () {
        assertValidDeadCodeEliminationOutput('case', [
            bundleWith([
                resource(
                    '/src/index.js',
                    'index.js',
                    'import data from "./data.json" with { type: "json" };\nexport default data;\n'
                ),
                resource('/src/data.json', 'data.json', '{"value":1}\n')
            ])
        ]);
    });
});
