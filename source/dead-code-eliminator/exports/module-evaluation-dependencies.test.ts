import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createExportModuleFixture } from '../../test-libraries/export-module-fixture.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { classifySideEffects } from '../../test-libraries/side-effect-classifier-test-support.ts';
import { createModuleExportIndex } from './module-export-index.ts';
import {
    moduleEvaluationDependencies,
    type ModuleEvaluationInput,
    type ModuleEvaluationLinks
} from './module-evaluation-dependencies.ts';

type EvaluationFixture = { readonly input: ModuleEvaluationInput; readonly links: ModuleEvaluationLinks; };

function evaluationFixture(content: string): EvaluationFixture {
    const fixture = createExportModuleFixture({ 'index.js': content, 'library.js': 'export const value=42;' }, []);
    const source = fixture.source('index.js');
    const model = fixture.models.get(source);
    assertDefined(model);
    return {
        input: {
            model,
            bindings: Array.from(model.locals.values()),
            effects: new Set(
                classifySideEffects(source, undefined).map(function (effect) {
                    return effect.statement;
                })
            )
        },
        links: {
            index: createModuleExportIndex(Array.from(fixture.models.values()), fixture.resolveModule),
            resolveModule(file, specifier) {
                assert.strictEqual(typeof specifier, 'string');
                return fixture.resolveModule(file, specifier);
            },
            binding() {
                return undefined;
            },
            exported() {
                return undefined;
            },
            evaluated() {
                return undefined;
            }
        }
    };
}

suite('module evaluation dependencies', function () {
    test('omits missing targets and does not resolve local export clauses', function () {
        const fixture = evaluationFixture(
            'const local=1;export {local};import {absent} from "./library.js";export {missing} from "./missing.js";export default effect();'
        );
        assert.deepStrictEqual(moduleEvaluationDependencies(fixture.input, fixture.links), []);
    });

    test('retains explicit exports when the namespace schema is unknown', function () {
        const fixture = evaluationFixture('export const value=1;export * from "./missing.js";');
        assert.deepStrictEqual(
            moduleEvaluationDependencies(fixture.input, {
                ...fixture.links,
                exported(_source, name) {
                    return name;
                }
            }),
            [ 'value' ]
        );
    });

    test('does not query forwarding status for a known local export', function () {
        const fixture = evaluationFixture('export const value=1;');
        assert.deepStrictEqual(
            moduleEvaluationDependencies(fixture.input, {
                ...fixture.links,
                index: {
                    ...fixture.links.index,
                    status() {
                        return assert.fail('Local exports do not require forwarding status');
                    }
                }
            }),
            []
        );
    });

    for (const content of [ 'effect();', 'class Local{static{effect();}}' ]) {
        test(`does not confuse ordinary effects with default exports: ${content}`, function () {
            const fixture = evaluationFixture(content);
            assert.deepStrictEqual(
                moduleEvaluationDependencies(fixture.input, {
                    ...fixture.links,
                    exported(_source, name) {
                        return name;
                    }
                }),
                []
            );
        });
    }
});
