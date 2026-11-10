import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { dynamicImportDependencies, moduleExportDependencies } from './module-export-dependencies.ts';

suite('module export dependencies', function () {
    test('excludes default exports from star forwarding', function () {
        const fixture = createExportModuleFixture({
            'index.js': 'export * from "./library.js";',
            'library.js': 'export default 42;'
        }, []);
        const model = fixture.models.get(fixture.source('index.js'));
        assertDefined(model);
        assert.deepStrictEqual(
            moduleExportDependencies(model, 'default', {
                resolveModule: fixture.resolveModule,
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
