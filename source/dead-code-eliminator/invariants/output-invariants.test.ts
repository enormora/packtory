import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { AnalyzedBundle, AnalyzedBundleResource } from '../analyzed-bundle.ts';
import {
    analyzedBundle,
    analyzedBundleResource,
    externalDependency
} from '../../test-libraries/bundle-fixtures.ts';
import { collectDeadCodeEliminationOutputIssues } from './output-invariants.ts';

function resource(inputFilePath: string, targetFilePath: string, content: string): AnalyzedBundleResource {
    return analyzedBundleResource(inputFilePath, { content, targetFilePath });
}

function resourceWithDependencies(
    inputFilePath: string,
    targetFilePath: string,
    content: string,
    directDependencies: ReadonlySet<string>
): AnalyzedBundleResource {
    return analyzedBundleResource(inputFilePath, { content, targetFilePath, directDependencies });
}

function bundleWith(
    contents: readonly AnalyzedBundleResource[],
    overrides: Partial<AnalyzedBundle> = {}
): AnalyzedBundle {
    return analyzedBundle({ name: 'pkg', contents, ...overrides });
}

function issues(bundle: AnalyzedBundle): readonly string[] {
    return collectDeadCodeEliminationOutputIssues([ bundle ]);
}

function assertNoIssues(bundle: AnalyzedBundle): void {
    assert.deepStrictEqual(issues(bundle), []);
}

function assertIssues(bundle: AnalyzedBundle, patterns: readonly RegExp[]): void {
    const text = issues(bundle).join('\n');
    for (const pattern of patterns) {
        assert.match(text, pattern);
    }
}

function assertExactIssues(bundle: AnalyzedBundle, expected: readonly string[]): void {
    assert.deepStrictEqual(issues(bundle), expected);
}

suite('dead code elimination output invariants', function () {
    suite('accepted graphs', function () {
        test('accepts runtime imports and re-exports that preserve exported bindings', function () {
            assertNoIssues(bundleWith([
                resource(
                    '/src/index.js',
                    'index.js',
                    [
                        'import fallback, { value as renamed } from "./value";',
                        'import * as namespace from "./namespace.js";',
                        'export { fallback, renamed, namespace };',
                        'export { named as publicName } from "./named.js";',
                        'export * from "./star.js";',
                        'export * as grouped from "./grouped.js";',
                        ''
                    ]
                        .join('\n')
                ),
                resource('/src/value.js', 'value.js', 'export default 1;\nexport const value = 2;\n'),
                resource('/src/namespace.js', 'namespace.js', 'export const member = 1;\n'),
                resource('/src/named.js', 'named.js', 'export const named = 1;\n'),
                resource('/src/star.js', 'star.js', 'export const star = 1;\n'),
                resource('/src/grouped.js', 'grouped.js', 'export const grouped = 1;\n')
            ]));
        });

        test('accepts declaration imports through source and declaration candidates', function () {
            assertNoIssues(bundleWith([
                resource(
                    '/src/index.d.ts',
                    'index.d.ts',
                    [
                        'import type { Api } from "./api.ts";',
                        'import type { MtsApi } from "./module.mts";',
                        'import type { CtsApi } from "./common.cts";',
                        'export type Public = Api | MtsApi | CtsApi;',
                        ''
                    ]
                        .join('\n')
                ),
                resource('/src/api.d.ts', 'api.d.ts', 'export type Api = string;\n'),
                resource('/src/module.d.mts', 'module.d.mts', 'export type MtsApi = string;\n'),
                resource('/src/common.d.cts', 'common.d.cts', 'export type CtsApi = string;\n')
            ]));
        });

        test('ignores package imports, type-only runtime imports, static exports, and source maps', function () {
            assertNoIssues(bundleWith([
                resource('/src/readme.md', 'readme.md', 'import "./missing.js";\n'),
                resourceWithDependencies(
                    '/src/index.js',
                    'index.js',
                    [
                        'import fs from "node:fs";',
                        'import config from "#config";',
                        'import type { Api } from "./types.js";',
                        'export { external } from "dep";',
                        'void import("lazy-dep");',
                        'export const value = Boolean(fs) && Boolean(config);',
                        ''
                    ]
                        .join('\n'),
                    new Set([ 'index.js.map' ])
                )
            ]));
        });

        test('accepts absolute targets, namespace imports, and type-only runtime re-exports', function () {
            assertNoIssues(bundleWith([
                resource(
                    '/src/index.js',
                    'lib/index.js',
                    [
                        'import * as namespace from "/value.js";',
                        'export type { Api } from "./types.js";',
                        'export * as data from "/data.json";',
                        'import { ok } from "/data.json";',
                        'export const value = namespace.value;',
                        ''
                    ]
                        .join('\n')
                ),
                resource('/src/value.js', 'value.js', 'export const value = 1;\n'),
                resource('/src/types.d.ts', 'types.d.ts', 'export type Api = string;\n'),
                resource('/src/data.json', 'data.json', '{"ok":true}\n')
            ]));
        });

        test('ignores named type-only imports in runtime mode', function () {
            assertNoIssues(bundleWith([
                resource(
                    '/src/index.js',
                    'index.js',
                    [
                        'import { type Api, value } from "./value.js";',
                        'export const output = value;',
                        ''
                    ]
                        .join('\n')
                ),
                resource('/src/value.js', 'value.js', 'export const value = 1;\n')
            ]));
        });

        test('keeps default imports unchecked when a namespace import is present', function () {
            assertNoIssues(bundleWith([
                resource(
                    '/src/index.js',
                    'index.js',
                    [
                        'import fallback, * as namespace from "./value.js";',
                        'export const output = namespace.value;',
                        ''
                    ]
                        .join('\n')
                ),
                resource('/src/value.js', 'value.js', 'export const value = 1;\n')
            ]));
        });

        test('accepts local export declarations for every local binding form', function () {
            assertNoIssues(bundleWith([
                resource(
                    '/src/index.js',
                    'index.js',
                    [
                        'import defaultImport, { named as renamed } from "./value.js";',
                        'import { first, second as renamedSecond } from "./more-values.js";',
                        'import * as namespace from "./namespace.js";',
                        'class ClassName {}',
                        'enum EnumName { A }',
                        'function functionName() {}',
                        'interface InterfaceName {}',
                        'namespace NamespaceName {}',
                        'type TypeName = string;',
                        'const variableName = 1;',
                        'export {',
                        '    defaultImport, renamed, renamedSecond, namespace, ClassName, EnumName,',
                        '    functionName, InterfaceName, NamespaceName, TypeName, variableName',
                        '};',
                        ''
                    ]
                        .join('\n')
                ),
                resource('/src/value.js', 'value.js', 'export default 1;\nexport const named = 1;\n'),
                resource(
                    '/src/more-values.js',
                    'more-values.js',
                    'export const first = 1;\nexport const second = 2;\n'
                ),
                resource('/src/namespace.js', 'namespace.js', 'export const value = 1;\n')
            ]));
        });
    });

    suite('reported issues', function () {
        test('reports local, dynamic, re-export, and metadata references to pruned targets', function () {
            assertIssues(
                bundleWith([
                    resourceWithDependencies(
                        '/src/index.js',
                        'index.js',
                        [
                            'import { missing } from "./missing.js";',
                            'export { gone } from "./gone.js";',
                            'export { localGone };',
                            'void import("./lazy.js");',
                            'export const value = missing;',
                            ''
                        ]
                            .join('\n'),
                        new Set([ 'direct.js' ])
                    )
                ], {
                    externalDependencies: new Map([
                        [ 'dep', {
                            ...externalDependency('dep', [ '/src/index.js' ]),
                            references: [ {
                                targetFilePath: 'external.js',
                                sourceSpecifier: 'dep',
                                emittedSpecifier: 'dep'
                            } ]
                        } ]
                    ]),
                    linkedBundleDependencies: new Map([
                        [ 'linked', externalDependency('linked', [ '/src/linked.js' ]) ]
                    ]),
                    substitutedInputFilePathsByPackageName: new Map([ [ 'substituted', new Set([ '/src/sub.js' ]) ] ])
                }),
                [
                    /index\.js imports \.\/missing\.js in runtime mode, but no emitted target remains/u,
                    /index\.js imports \.\/gone\.js in runtime mode, but no emitted target remains/u,
                    /index\.js exports local localGone, but no local binding remains/u,
                    /index\.js imports \.\/lazy\.js in runtime mode, but no emitted target remains/u,
                    /external dependency dep references pruned target file external\.js/u,
                    /linked bundle dependency linked references pruned target file linked\.js/u,
                    /substituted source paths keep package substituted without linked dependency metadata/u,
                    /index\.js has direct dependency on pruned target file direct\.js/u
                ]
            );
        });

        test('accepts present dependency metadata references', function () {
            assertNoIssues(bundleWith([
                resource('/src/index.js', 'index.js', 'export const value = 1;\n'),
                resource('/src/external.js', 'external.js', 'export const external = 1;\n'),
                resource('/src/linked.js', 'linked.js', 'export const linked = 1;\n'),
                resourceWithDependencies(
                    '/src/readme.md',
                    'readme.md',
                    '# readme\n',
                    new Set([ 'missing.md' ])
                )
            ], {
                externalDependencies: new Map([
                    [ 'dep', {
                        ...externalDependency('dep', [ 'index.js' ]),
                        references: [ {
                            targetFilePath: 'external.js',
                            sourceSpecifier: 'dep',
                            emittedSpecifier: 'dep'
                        } ]
                    } ]
                ]),
                linkedBundleDependencies: new Map([
                    [ 'linked', externalDependency('linked', [ 'linked.js' ]) ],
                    [ 'substituted', externalDependency('substituted', [ 'index.js' ]) ]
                ]),
                substitutedInputFilePathsByPackageName: new Map([ [ 'substituted', new Set([ '/src/sub.js' ]) ] ])
            }));
        });

        test('reports declaration-mode missing targets without runtime declaration-only candidates', function () {
            assertExactIssues(
                bundleWith([
                    resource('/src/index.d.ts', 'index.d.ts', 'import type { Api } from "./missing.js";\n')
                ]),
                [
                    'pkg: index.d.ts imports ./missing.js in declaration mode, but no emitted target remains'
                ]
            );
        });

        test('reports type-only declaration imports and exports when their targets are pruned', function () {
            assertExactIssues(
                bundleWith([
                    resource(
                        '/src/index.d.ts',
                        'index.d.ts',
                        [
                            'import { type Imported } from "./imported.js";',
                            'export type { Exported } from "./exported.js";',
                            ''
                        ]
                            .join('\n')
                    ),
                    resource('/src/imported.d.ts', 'imported.d.ts', 'export type Present = string;\n')
                ]),
                [
                    'pkg: index.d.ts imports Imported from ./imported.js, but imported.d.ts does not export it in declaration mode',
                    'pkg: index.d.ts imports ./exported.js in declaration mode, but no emitted target remains'
                ]
            );
        });

        test('reports missing imported names through aliases and re-export chains', function () {
            assertIssues(
                bundleWith([
                    resource(
                        '/src/index.js',
                        'index.js',
                        [
                            'import { missing as renamed } from "./named.js";',
                            'import fallback from "./without-default.js";',
                            'export { missing as exposed } from "./re-export.js";',
                            ''
                        ]
                            .join('\n')
                    ),
                    resource('/src/named.js', 'named.js', 'export const present = 1;\n'),
                    resource('/src/without-default.js', 'without-default.js', 'export const present = 1;\n'),
                    resource('/src/re-export.js', 're-export.js', 'export { present } from "./leaf.js";\n'),
                    resource('/src/leaf.js', 'leaf.js', 'export const present = 1;\n')
                ]),
                [
                    /imports missing from \.\/named\.js, but named\.js does not export it in runtime mode/u,
                    /imports default from \.\/without-default\.js, but without-default\.js does not export it in runtime mode/u,
                    /imports missing from \.\/re-export\.js, but re-export\.js does not export it in runtime mode/u
                ]
            );
        });

        test('accepts imported names through re-export chains', function () {
            assertNoIssues(bundleWith([
                resource('/src/index.js', 'index.js', 'import { exposed } from "./barrel.js";\nexport { exposed };\n'),
                resource('/src/barrel.js', 'barrel.js', 'export { value as exposed } from "./leaf.js";\n'),
                resource('/src/leaf.js', 'leaf.js', 'export const value = 1;\n')
            ]));
        });

        test('reports imported names through unresolved star re-export chains', function () {
            assertExactIssues(
                bundleWith([
                    resource('/src/index.js', 'index.js', 'import { missing } from "./barrel.js";\n'),
                    resource('/src/barrel.js', 'barrel.js', 'export * from "./missing-leaf.js";\n')
                ]),
                [
                    'pkg: index.js imports missing from ./barrel.js, but barrel.js does not export it in runtime mode',
                    'pkg: barrel.js imports ./missing-leaf.js in runtime mode, but no emitted target remains'
                ]
            );
        });

        test('formats declaration-only runtime target issues exactly', function () {
            assertExactIssues(
                bundleWith([
                    resource('/src/index.js', 'index.js', 'import { value } from "./value.js";\n'),
                    resource('/src/value.d.ts', 'value.d.ts', 'export declare const value: number;\n')
                ]),
                [
                    'pkg: index.js imports ./value.js in runtime mode, but only declaration targets remain: value.d.ts'
                ]
            );
        });

        test('formats multiple declaration-only runtime targets exactly', function () {
            assertExactIssues(
                bundleWith([
                    resource('/src/index.js', 'index.js', 'import { value } from "./value.mjs";\n'),
                    resource('/src/value.d.mts', 'value.d.mts', 'export declare const value: number;\n'),
                    resource('/src/value.d.ts', 'value.d.ts', 'export declare const value: number;\n')
                ]),
                [
                    'pkg: index.js imports ./value.mjs in runtime mode, but only declaration targets remain: value.d.mts, value.d.ts'
                ]
            );
        });

        test('reports duplicate emitted target paths exactly', function () {
            assertExactIssues(
                bundleWith([
                    resource('/src/first.js', 'index.js', 'export const first = 1;\n'),
                    resource('/src/second.js', 'index.js', 'export const second = 1;\n')
                ]),
                [
                    'pkg: duplicate emitted target path index.js'
                ]
            );
        });
    });
});
