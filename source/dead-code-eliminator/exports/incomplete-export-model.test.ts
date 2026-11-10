import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createExportModuleFixture, type ExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createSourcePreparation } from '../../source-transformation/source-preparation.ts';
import { collectCandidateExportNames } from './candidate-export-names.ts';
import { createModuleExportIndex } from './module-export-index.ts';
import { moduleExportDependencies } from './module-export-dependencies.ts';
import { normalizeStarExports } from './star-export-preparation.ts';
import type { ModuleExportModel } from './module-export-model.ts';

function incompleteModel(model: ModuleExportModel): ModuleExportModel {
    return {
        ...model,
        entries: new Map(Array.from(model.entries, function ([ name, entry ]) {
            return [ name, entry.kind === 'namespace' ? { ...entry, specifier: undefined } : entry ] as const;
        })),
        stars: model.stars.map(function (star) {
            return { ...star, specifier: undefined };
        })
    };
}

function incompleteFixture(content: string): ExportModuleFixture {
    const fixture = createExportModuleFixture({ 'index.js': content }, []);
    return {
        ...fixture,
        models: new Map(Array.from(fixture.models, function ([ source, model ]) {
            return [ source, incompleteModel(model) ];
        }))
    };
}

suite('incomplete module specifiers', function () {
    for (const content of [ 'export * from "./missing.js";', 'export * as ns from "./missing.js";' ]) {
        test(`keeps unresolved export names unknown for ${content}`, function () {
            const fixture = incompleteFixture(content);
            const source = fixture.source('index.js');
            const index = createModuleExportIndex(Array.from(fixture.models.values()), fixture.resolveModule);
            const candidates = collectCandidateExportNames(Array.from(fixture.models.values()), fixture.resolveModule);
            assert.strictEqual(candidates.opaque.has(source), content === 'export * from "./missing.js";');
            assert.strictEqual(index.names(source), undefined);
            assert.strictEqual(index.status(source, 'ns'), 'unknown');
        });

        test(`preserves forwarding syntax with incomplete metadata in ${content}`, function () {
            const fixture = incompleteFixture(content);
            const source = fixture.source('index.js');
            const preparation = createSourcePreparation(source);
            const index = createModuleExportIndex(Array.from(fixture.models.values()), fixture.resolveModule);
            normalizeStarExports([ preparation ], index, fixture.resolveModule);
            assert.strictEqual(source.getFullText(), content);
        });

        test(`does not create edges without a target in ${content}`, function () {
            const fixture = incompleteFixture(content);
            const source = fixture.source('index.js');
            const model = fixture.models.get(source);
            assertDefined(model);
            assert.deepStrictEqual(
                moduleExportDependencies(model, 'ns', {
                    resolveModule: fixture.resolveModule,
                    binding() {
                        return assert.fail('An unresolved module cannot supply a binding');
                    },
                    exported() {
                        return assert.fail('An unresolved module cannot forward a binding');
                    },
                    namespaceTargets() {
                        return assert.fail('An unresolved module cannot supply a namespace');
                    },
                    demand: {
                        properties() {
                            return assert.fail('An unresolved module cannot supply namespace demand');
                        },
                        exportProperties() {
                            return assert.fail('An unresolved module cannot supply export demand');
                        }
                    }
                }),
                []
            );
        });
    }
});
