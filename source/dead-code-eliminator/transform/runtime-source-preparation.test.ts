import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createSourcePreparation, type SourcePreparation } from '../../source-transformation/source-preparation.ts';
import { specializeExpressions } from './expression-specialization.ts';
import { prepareInitialRuntimeSource } from './runtime-source-preparation.ts';

suite('runtime preparation convergence', function () {
    for (const literal of [ '-0', '-1' ]) {
        test(`does not rewrite the canonical literal ${literal}`, function () {
            const content = `export const value=${literal};`;
            const preparation = createSourcePreparation(createProject().createSourceFile('input.ts', content));
            specializeExpressions(preparation);
            assert.strictEqual(preparation.sourceFile.getFullText(), content);
            assert.deepStrictEqual(preparation.transformations, []);
        });
    }

    for (const content of [ '', 'eval("unknown()");(()=>42)();' ]) {
        test(`keeps ineligible preparation unchanged for ${content}`, function () {
            const preparation = createSourcePreparation(createProject().createSourceFile('input.ts', content));
            prepareInitialRuntimeSource({
                ...preparation,
                applyEdits() {
                    assert.fail('empty or dynamically scoped sources must not schedule transformations');
                }
            });
            assert.strictEqual(preparation.sourceFile.getFullText(), content);
        });
    }

    test('stops when a pass leaves the source unchanged', function () {
        const preparation = createSourcePreparation(
            createProject().createSourceFile('input.ts', 'export const value=1;')
        );
        let applications = 0;
        prepareInitialRuntimeSource({
            ...preparation,
            applyEdits(edits) {
                applications += 1;
                assert.ok(applications <= 3);
                preparation.applyEdits(edits);
            }
        });
        assert.ok(applications > 0);
        assert.strictEqual(preparation.sourceFile.getFullText(), 'export const value=1;');
    });

    test('bounds transformation work when every pass changes the source', function () {
        const preparation = createSourcePreparation(
            createProject().createSourceFile('input.ts', 'export const value=1;')
        );
        let applications = 0;
        const changingPreparation: SourcePreparation = {
            ...preparation,
            applyEdits(edits) {
                applications += 1;
                assert.ok(applications <= 100);
                preparation.applyEdits(edits);
                const end = preparation.sourceFile.getFullText().length;
                preparation.applyEdits([ { start: end, end, content: ';' } ]);
            }
        };
        prepareInitialRuntimeSource(changingPreparation);
        assert.strictEqual(applications, 64);
    });
});
