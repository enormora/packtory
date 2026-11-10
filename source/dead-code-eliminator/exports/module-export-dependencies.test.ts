import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { dynamicImportDependencies, moduleExportDependencies } from './module-export-dependencies.ts';

suite('module export dependencies', function () {
    for (const declaration of [ 'export * from "./library.js";', 'export default class{}' ]) {
        test(`excludes default dependencies for ${declaration}`, function () {
            const fixture = createExportModuleFixture({
                'index.js': declaration,
                'library.js': 'export default 42;'
            }, []);
            const model = fixture.models.get(fixture.source('index.js'));
            assertDefined(model);
            assert.deepStrictEqual(
                moduleExportDependencies(model, 'default', {
                    resolveModule() {
                        return assert.fail('Default declarations must not request a module');
                    },
                    binding() {
                        return assert.fail('Default star lookup must not request a binding');
                    },
                    exported() {
                        return assert.fail('Default star lookup must not forward an export');
                    },
                    namespaceTargets() {
                        return assert.fail('Default star lookup must not observe a namespace');
                    },
                    demand: {
                        properties() {
                            return assert.fail('Default star lookup must not request namespace demand');
                        },
                        exportProperties() {
                            return assert.fail('Default star lookup must not request export demand');
                        }
                    }
                }),
                []
            );
        });
    }

    suite('link boundaries', function () {
        for (
            const [ name, expected ] of [
                [ 'forwarded', [] ],
                [ 'namespace', [ 'namespace' ] ],
                [ 'default', [] ],
                [ 'local', [] ]
            ] as const
        ) {
            test(`resolves ${name} when links can be absent`, function () {
                const fixture = createExportModuleFixture({
                    'index.js':
                        'export {used as forwarded} from "./library.js";export * as namespace from "./library.js";export default 1;export const local=1;',
                    'library.js': 'export const used=1;'
                }, []);
                const model = fixture.models.get(fixture.source('index.js'));
                assertDefined(model);
                assert.deepStrictEqual(
                    moduleExportDependencies(model, name, {
                        resolveModule: fixture.resolveModule,
                        binding() {
                            return undefined;
                        },
                        exported() {
                            return undefined;
                        },
                        namespaceTargets() {
                            return [ 'namespace' ];
                        },
                        demand: {
                            properties() {
                                return undefined;
                            },
                            exportProperties() {
                                return undefined;
                            }
                        }
                    }),
                    expected
                );
            });
        }

        for (const content of [ 'import(unknown);', 'import("./library.js");' ]) {
            test(`excludes absent evaluation links for ${content}`, function () {
                const fixture = createExportModuleFixture({
                    'index.js': content,
                    'library.js': 'export const value=1;'
                }, []);
                const call = fixture.source('index.js').getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
                const dependencies = dynamicImportDependencies(call, {
                    sources: [ fixture.source('library.js') ],
                    resolveModule(source, specifier) {
                        assert.strictEqual(specifier, './library.js');
                        return fixture.resolveModule(source, specifier);
                    },
                    evaluated() {
                        return undefined;
                    },
                    namespaceTargets() {
                        return [ 'namespace' ];
                    }
                });
                assert.deepStrictEqual(dependencies, [ 'namespace' ]);
            });
        }
    });

    for (
        const [ content, expected ] of [
            [ 'import("./external.js");', undefined ],
            [ 'import("./external"+".js");', [
                'index.js:evaluate',
                'index.js:*',
                'library.js:evaluate',
                'library.js:*'
            ] ],
            [ 'ordinary();', undefined ]
        ] as const
    ) {
        test(`resolves dependencies conservatively for ${content}`, function () {
            const fixture = createExportModuleFixture({
                'index.js': content,
                'library.js': 'export const value=42;',
                'types.d.ts': 'export interface Value {}'
            }, []);
            const call = fixture.source('index.js').getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
            const dependencies = dynamicImportDependencies(call, {
                sources: [ 'index.js', 'library.js', 'types.d.ts' ].map(fixture.source),
                resolveModule: fixture.resolveModule,
                evaluated(source) {
                    return source === undefined ? undefined : `${source.getBaseName()}:evaluate`;
                },
                namespaceTargets(source, properties) {
                    assert.strictEqual(properties, undefined);
                    return [ `${source.getBaseName()}:*` ];
                }
            });
            assert.deepStrictEqual(dependencies, expected);
        });
    }
});
