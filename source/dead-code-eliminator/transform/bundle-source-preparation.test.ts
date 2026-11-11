import assert from 'node:assert';
import { suite, test } from 'mocha';
import { multiFileBindingsFor } from '../../test-libraries/reachability-test-support.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createSourcePreparation } from '../../source-transformation/source-preparation.ts';
import { resolveRuntimeModule } from '../runtime-module-resolution.ts';
import { createSourceEvaluation } from '../evaluation/constant-evaluation.ts';
import type { EvaluatedValue } from '../evaluation/primitive-value.ts';
import type { PreparedModule } from '../exports/prepared-module-graph.ts';
import { prepareBundleSources } from './bundle-source-preparation.ts';

function preparedModules(
    contents: readonly { readonly filePath: string; readonly content: string; }[]
): readonly PreparedModule[] {
    const modules = multiFileBindingsFor(contents).map(function (file) {
        return { ...file, sourceFile: file.sourceFile.getSourceFile() };
    });
    prepareBundleSources(
        modules.map(function (file) {
            return createSourcePreparation(file.sourceFile);
        }),
        modules,
        resolveRuntimeModule,
        function () {
            return false;
        }
    );
    return modules;
}

function exportedValue(module: PreparedModule | undefined): EvaluatedValue | undefined {
    assertDefined(module);
    const initializer = module.sourceFile.getVariableDeclarationOrThrow('value').getInitializerOrThrow();
    return createSourceEvaluation(module.sourceFile).primitiveValue(initializer);
}

suite('bundle preparation convergence', function () {
    test('stops when all prepared sources remain unchanged', function () {
        const [ file ] = multiFileBindingsFor([ { filePath: '/repo/index.js', content: 'export const value=1;' } ]);
        assertDefined(file);
        const preparation = createSourcePreparation(file.sourceFile.getSourceFile());
        let applications = 0;
        prepareBundleSources(
            [ {
                ...preparation,
                applyEdits(edits) {
                    applications += 1;
                    assert.ok(applications <= 4);
                    preparation.applyEdits(edits);
                }
            } ],
            [ { ...file, sourceFile: preparation.sourceFile } ],
            resolveRuntimeModule,
            function () {
                return false;
            }
        );
        assert.ok(applications > 0);
        assert.strictEqual(preparation.sourceFile.getFullText(), 'export const value=1;');
    });

    test('retains remaining computation when dependencies keep changing', function () {
        const [ file, dependency ] = multiFileBindingsFor([
            { filePath: '/repo/index.js', content: 'const unused=unknown();export{};' },
            { filePath: '/repo/dependency.js', content: 'export const value=0;' }
        ]);
        assertDefined(file);
        assertDefined(dependency);
        const preparation = createSourcePreparation(file.sourceFile.getSourceFile());
        let observations = 0;
        prepareBundleSources(
            [ preparation ],
            [ file, dependency ].map(function (module) {
                return { ...module, sourceFile: module.sourceFile.getSourceFile() };
            }),
            resolveRuntimeModule,
            function (expression) {
                assert.strictEqual(expression.getText(), 'unknown()');
                observations += 1;
                assert.ok(observations <= 32);
                dependency.sourceFile.replaceWithText(`export const value=${observations};`);
                return true;
            }
        );
        assert.strictEqual(observations, 32);
        assert.strictEqual(preparation.sourceFile.getFullText(), 'const unused=unknown();export{};');
    });

    test('folds imported computations through successive bundle passes', function () {
        const modules = preparedModules(Array.from({ length: 4 }, function (_value, index) {
            return {
                filePath: `/repo/${index}.js`,
                content: index === 3
                    ? 'export const value=0;'
                    : `import {value as previous} from "./${index + 1}.js";export const value=previous+1;`
            };
        }));
        assert.deepStrictEqual(exportedValue(modules[0]), { value: 3 });
        assert.deepStrictEqual(exportedValue(modules[1]), { value: 2 });
    });
});
