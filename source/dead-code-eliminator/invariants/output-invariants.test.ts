import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { AnalyzedBundle, AnalyzedBundleResource } from '../analyzed-bundle.ts';
import {
    analyzedBundle,
    analyzedBundleResource,
    externalDependency
} from '../../test-libraries/bundle-fixtures.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { collectDeadCodeEliminationOutputIssues } from './output-invariants.ts';

function bundleWith(
    contents: readonly AnalyzedBundleResource[],
    overrides: Partial<AnalyzedBundle> = {}
): AnalyzedBundle {
    return analyzedBundle({ name: 'package', contents, ...overrides });
}

function issues(bundle: AnalyzedBundle): readonly string[] {
    return collectDeadCodeEliminationOutputIssues([ bundle ], createProject);
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
    suite('compiler project isolation', function () {
        test('validates emitted content instead of preloaded compiler content', function () {
            const emittedBundle = bundleWith([
                analyzedBundleResource('/source/index.js', {
                    targetFilePath: 'index.js',
                    content: 'export const value = 1;'
                })
            ]);

            assert.deepStrictEqual(
                collectDeadCodeEliminationOutputIssues([ emittedBundle ], function () {
                    return createProject({
                        withFiles: [ { filePath: '/package/index.js', content: 'import "./missing.js";' } ]
                    });
                }),
                []
            );
        });

        test('rejects targets present only in the injected compiler project', function () {
            const emittedBundle = bundleWith([
                analyzedBundleResource('/source/index.js', {
                    targetFilePath: 'index.js',
                    content: 'import { value } from "./missing.js";'
                })
            ]);

            assert.deepStrictEqual(
                collectDeadCodeEliminationOutputIssues([ emittedBundle ], function () {
                    return createProject({
                        withFiles: [ { filePath: '/package/missing.js', content: 'export const value = 1;' } ]
                    });
                }),
                [ 'package: index.js imports ./missing.js in runtime mode, but no emitted target remains' ]
            );
        });
    });

    suite('accepted graphs', function () {
        test('accepts runtime imports and re-exports that preserve exported bindings', function () {
            const bundle = bundleWith([
                analyzedBundleResource('/source/index.js', {
                    targetFilePath: 'index.js',
                    content: [
                        'import fallback, { value as renamed } from "./value";',
                        'import * as namespace from "./namespace.js";',
                        'export { fallback, renamed, namespace };',
                        'export { named as publicName } from "./named.js";',
                        'export * from "./star.js";',
                        'export * as grouped from "./grouped.js";',
                        ''
                    ]
                        .join('\n')
                }),
                analyzedBundleResource('/source/value.js', {
                    targetFilePath: 'value.js',
                    content: 'export default 1;\nexport const value = 2;\n'
                }),
                analyzedBundleResource('/source/namespace.js', {
                    targetFilePath: 'namespace.js',
                    content: 'export const member = 1;\n'
                }),
                analyzedBundleResource('/source/named.js', {
                    targetFilePath: 'named.js',
                    content: 'export const named = 1;\n'
                }),
                analyzedBundleResource('/source/star.js', {
                    targetFilePath: 'star.js',
                    content: 'export const star = 1;\n'
                }),
                analyzedBundleResource('/source/grouped.js', {
                    targetFilePath: 'grouped.js',
                    content: 'export const grouped = 1;\n'
                })
            ]);
            assertNoIssues(bundle);
        });

        test('accepts declaration imports through source and declaration candidates', function () {
            const bundle = bundleWith([
                analyzedBundleResource('/source/index.d.ts', {
                    targetFilePath: 'index.d.ts',
                    content: [
                        'import type { Api } from "./api.ts";',
                        'import type { MtsApi } from "./module.mts";',
                        'import type { CtsApi } from "./common.cts";',
                        'export type Public = Api | MtsApi | CtsApi;',
                        ''
                    ]
                        .join('\n')
                }),
                analyzedBundleResource('/source/api.d.ts', {
                    targetFilePath: 'api.d.ts',
                    content: 'export type Api = string;\n'
                }),
                analyzedBundleResource('/source/module.d.mts', {
                    targetFilePath: 'module.d.mts',
                    content: 'export type MtsApi = string;\n'
                }),
                analyzedBundleResource('/source/common.d.cts', {
                    targetFilePath: 'common.d.cts',
                    content: 'export type CtsApi = string;\n'
                })
            ]);
            assertNoIssues(bundle);
        });

        test('ignores package imports, type-only runtime imports, static exports, and source maps', function () {
            const bundle = bundleWith([
                analyzedBundleResource('/source/readme.md', {
                    targetFilePath: 'readme.md',
                    content: 'import "./missing.js";\n'
                }),
                analyzedBundleResource('/source/index.js', {
                    targetFilePath: 'index.js',
                    content: [
                        'import fs from "node:fs";',
                        'import config from "#config";',
                        'import type { Api } from "./types.js";',
                        'export { external } from "dep";',
                        'void import("lazy-dep");',
                        'export const value = Boolean(fs) && Boolean(config);',
                        ''
                    ]
                        .join('\n'),
                    directDependencies: new Set([ 'index.js.map' ])
                })
            ]);
            assertNoIssues(bundle);
        });

        test('accepts absolute targets, namespace imports, and type-only runtime re-exports', function () {
            const bundle = bundleWith([
                analyzedBundleResource('/source/index.js', {
                    targetFilePath: 'lib/index.js',
                    content: [
                        'import * as namespace from "/value.js";',
                        'export type { Api } from "./types.js";',
                        'export * as data from "/data.json";',
                        'import { ok } from "/data.json";',
                        'export const value = namespace.value;',
                        ''
                    ]
                        .join('\n')
                }),
                analyzedBundleResource('/source/value.js', {
                    targetFilePath: 'value.js',
                    content: 'export const value = 1;\n'
                }),
                analyzedBundleResource('/source/types.d.ts', {
                    targetFilePath: 'types.d.ts',
                    content: 'export type Api = string;\n'
                }),
                analyzedBundleResource('/source/data.json', {
                    targetFilePath: 'data.json',
                    content: '{"ok":true}\n'
                })
            ]);
            assertNoIssues(bundle);
        });

        test('ignores named type-only imports in runtime mode', function () {
            const bundle = bundleWith([
                analyzedBundleResource('/source/index.js', {
                    targetFilePath: 'index.js',
                    content: [ 'import { type Api, value } from "./value.js";', 'export const output = value;', '' ]
                        .join('\n')
                }),
                analyzedBundleResource('/source/value.js', {
                    targetFilePath: 'value.js',
                    content: 'export const value = 1;\n'
                })
            ]);
            assertNoIssues(bundle);
        });

        test('keeps default imports unchecked when a namespace import is present', function () {
            const bundle = bundleWith([
                analyzedBundleResource('/source/index.js', {
                    targetFilePath: 'index.js',
                    content: [
                        'import fallback, * as namespace from "./value.js";',
                        'export const output = namespace.value;',
                        ''
                    ]
                        .join('\n')
                }),
                analyzedBundleResource('/source/value.js', {
                    targetFilePath: 'value.js',
                    content: 'export const value = 1;\n'
                })
            ]);
            assertNoIssues(bundle);
        });

        test('accepts local export declarations for every local binding form', function () {
            const bundle = bundleWith([
                analyzedBundleResource('/source/index.js', {
                    targetFilePath: 'index.js',
                    content: [
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
                }),
                analyzedBundleResource('/source/value.js', {
                    targetFilePath: 'value.js',
                    content: 'export default 1;\nexport const named = 1;\n'
                }),
                analyzedBundleResource('/source/more-values.js', {
                    targetFilePath: 'more-values.js',
                    content: 'export const first = 1;\nexport const second = 2;\n'
                }),
                analyzedBundleResource('/source/namespace.js', {
                    targetFilePath: 'namespace.js',
                    content: 'export const value = 1;\n'
                })
            ]);
            assertNoIssues(bundle);
        });
    });

    suite('reported issues', function () {
        test('reports local, dynamic, re-export, and metadata references to pruned targets', function () {
            const bundle = bundleWith([
                analyzedBundleResource('/source/index.js', {
                    targetFilePath: 'index.js',
                    content: [
                        'import { missing } from "./missing.js";',
                        'export { gone } from "./gone.js";',
                        'export { localGone };',
                        'void import("./lazy.js");',
                        'export const value = missing;',
                        ''
                    ]
                        .join('\n'),
                    directDependencies: new Set([ 'direct.js' ])
                })
            ], {
                externalDependencies: new Map([
                    [ 'dep', {
                        ...externalDependency('dep', [ '/source/index.js' ]),
                        references: [ {
                            targetFilePath: 'external.js',
                            sourceSpecifier: 'dep',
                            emittedSpecifier: 'dep'
                        } ]
                    } ]
                ]),
                linkedBundleDependencies: new Map([
                    [ 'linked', externalDependency('linked', [ '/source/linked.js' ]) ]
                ]),
                substitutedInputFilePathsByPackageName: new Map([ [
                    'substituted',
                    new Set([ '/source/sub.js' ])
                ] ])
            });
            assertIssues(
                bundle,
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
            const bundle = bundleWith([
                analyzedBundleResource('/source/index.js', {
                    targetFilePath: 'index.js',
                    content: 'export const value = 1;\n'
                }),
                analyzedBundleResource('/source/external.js', {
                    targetFilePath: 'external.js',
                    content: 'export const external = 1;\n'
                }),
                analyzedBundleResource('/source/linked.js', {
                    targetFilePath: 'linked.js',
                    content: 'export const linked = 1;\n'
                }),
                analyzedBundleResource('/source/readme.md', {
                    targetFilePath: 'readme.md',
                    content: '# readme\n',
                    directDependencies: new Set([ 'missing.md' ])
                })
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
                substitutedInputFilePathsByPackageName: new Map([ [ 'substituted', new Set([ '/source/sub.js' ]) ] ])
            });
            assertNoIssues(bundle);
        });

        test('reports declaration-mode missing targets without runtime declaration-only candidates', function () {
            assertExactIssues(
                bundleWith([
                    analyzedBundleResource('/source/index.d.ts', {
                        targetFilePath: 'index.d.ts',
                        content: 'import type { Api } from "./missing.js";\n'
                    })
                ]),
                [
                    'package: index.d.ts imports ./missing.js in declaration mode, but no emitted target remains'
                ]
            );
        });

        test('reports type-only declaration imports and exports when their targets are pruned', function () {
            const bundle = bundleWith([
                analyzedBundleResource('/source/index.d.ts', {
                    targetFilePath: 'index.d.ts',
                    content: [
                        'import { type Imported } from "./imported.js";',
                        'export type { Exported } from "./exported.js";',
                        ''
                    ]
                        .join('\n')
                }),
                analyzedBundleResource('/source/imported.d.ts', {
                    targetFilePath: 'imported.d.ts',
                    content: 'export type Present = string;\n'
                })
            ]);
            assertExactIssues(
                bundle,
                [
                    'package: index.d.ts imports Imported from ./imported.js, but imported.d.ts does not export it in declaration mode',
                    'package: index.d.ts imports ./exported.js in declaration mode, but no emitted target remains'
                ]
            );
        });

        test('reports missing imported names through aliases and re-export chains', function () {
            const bundle = bundleWith([
                analyzedBundleResource('/source/index.js', {
                    targetFilePath: 'index.js',
                    content: [
                        'import { missing as renamed } from "./named.js";',
                        'import fallback from "./without-default.js";',
                        'export { missing as exposed } from "./re-export.js";',
                        ''
                    ]
                        .join('\n')
                }),
                analyzedBundleResource('/source/named.js', {
                    targetFilePath: 'named.js',
                    content: 'export const present = 1;\n'
                }),
                analyzedBundleResource('/source/without-default.js', {
                    targetFilePath: 'without-default.js',
                    content: 'export const present = 1;\n'
                }),
                analyzedBundleResource('/source/re-export.js', {
                    targetFilePath: 're-export.js',
                    content: 'export { present } from "./leaf.js";\n'
                }),
                analyzedBundleResource('/source/leaf.js', {
                    targetFilePath: 'leaf.js',
                    content: 'export const present = 1;\n'
                })
            ]);
            assertIssues(
                bundle,
                [
                    /imports missing from \.\/named\.js, but named\.js does not export it in runtime mode/u,
                    /imports default from \.\/without-default\.js, but without-default\.js does not export it in runtime mode/u,
                    /imports missing from \.\/re-export\.js, but re-export\.js does not export it in runtime mode/u
                ]
            );
        });

        test('accepts imported names through re-export chains', function () {
            assertNoIssues(bundleWith([
                analyzedBundleResource('/source/index.js', {
                    targetFilePath: 'index.js',
                    content: 'import { exposed } from "./barrel.js";\nexport { exposed };\n'
                }),
                analyzedBundleResource('/source/barrel.js', {
                    targetFilePath: 'barrel.js',
                    content: 'export { value as exposed } from "./leaf.js";\n'
                }),
                analyzedBundleResource('/source/leaf.js', {
                    targetFilePath: 'leaf.js',
                    content: 'export const value = 1;\n'
                })
            ]));
        });

        test('reports imported names through unresolved star re-export chains', function () {
            assertExactIssues(
                bundleWith([
                    analyzedBundleResource('/source/index.js', {
                        targetFilePath: 'index.js',
                        content: 'import { missing } from "./barrel.js";\n'
                    }),
                    analyzedBundleResource('/source/barrel.js', {
                        targetFilePath: 'barrel.js',
                        content: 'export * from "./missing-leaf.js";\n'
                    })
                ]),
                [
                    'package: index.js imports missing from ./barrel.js, but barrel.js does not export it in runtime mode',
                    'package: barrel.js imports ./missing-leaf.js in runtime mode, but no emitted target remains'
                ]
            );
        });

        test('formats declaration-only runtime target issues exactly', function () {
            assertExactIssues(
                bundleWith([
                    analyzedBundleResource('/source/index.js', {
                        targetFilePath: 'index.js',
                        content: 'import { value } from "./value.js";\n'
                    }),
                    analyzedBundleResource('/source/value.d.ts', {
                        targetFilePath: 'value.d.ts',
                        content: 'export declare const value: number;\n'
                    })
                ]),
                [
                    'package: index.js imports ./value.js in runtime mode, but only declaration targets remain: value.d.ts'
                ]
            );
        });

        test('formats multiple declaration-only runtime targets exactly', function () {
            assertExactIssues(
                bundleWith([
                    analyzedBundleResource('/source/index.js', {
                        targetFilePath: 'index.js',
                        content: 'import { value } from "./value.mjs";\n'
                    }),
                    analyzedBundleResource('/source/value.d.mts', {
                        targetFilePath: 'value.d.mts',
                        content: 'export declare const value: number;\n'
                    }),
                    analyzedBundleResource('/source/value.d.ts', {
                        targetFilePath: 'value.d.ts',
                        content: 'export declare const value: number;\n'
                    })
                ]),
                [
                    'package: index.js imports ./value.mjs in runtime mode, but only declaration targets remain: value.d.mts, value.d.ts'
                ]
            );
        });

        test('reports duplicate emitted target paths exactly', function () {
            assertExactIssues(
                bundleWith([
                    analyzedBundleResource('/source/first.js', {
                        targetFilePath: 'index.js',
                        content: 'export const first = 1;\n'
                    }),
                    analyzedBundleResource('/source/second.js', {
                        targetFilePath: 'index.js',
                        content: 'export const second = 1;\n'
                    })
                ]),
                [
                    'package: duplicate emitted target path index.js'
                ]
            );
        });
    });
});
