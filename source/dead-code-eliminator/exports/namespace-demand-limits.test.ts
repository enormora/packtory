import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { namespaceDemandLimits, namespaceSyntaxBudgetSize } from './namespace-demand-solver.ts';

suite('namespace demand limits', function () {
    for (
        const content of [
            '',
            'const value=1;',
            '// value\nconst value=1;',
            '/* value */export const value=1;',
            '/** value */export const api={read(){return 42;}};'
        ]
    ) {
        test(`preserves the syntax size of a small source in ${content}`, function () {
            const source = createProject().createSourceFile('input.js', content);

            assert.strictEqual(namespaceSyntaxBudgetSize([ source ]), source.getDescendants().length);
        });
    }

    test('combines syntax sizes across small sources', function () {
        const project = createProject();
        const files = [
            project.createSourceFile('first.js', 'export const first=1;'),
            project.createSourceFile('second.js', 'export const second=2;')
        ];

        assert.strictEqual(
            namespaceSyntaxBudgetSize(files),
            files.reduce(function (size, source) {
                return size + source.getDescendants().length;
            }, 0)
        );
        assert.strictEqual(namespaceSyntaxBudgetSize([]), 0);
    });

    test('does not inspect remaining files once the evaluation budget is saturated', function () {
        const source = createProject().createSourceFile(
            'input.js',
            Array
                .from({ length: 64 }, function (_value, index) {
                    return `export const value${index}=${index};`;
                })
                .join('\n')
        );
        const size = namespaceSyntaxBudgetSize([
            source,
            new Proxy(source, {
                get() {
                    return assert.fail('A saturated budget must not inspect remaining sources');
                }
            })
        ]);

        assert.strictEqual(size, 181);
        assert.deepStrictEqual(namespaceDemandLimits([ size ]), namespaceDemandLimits([ Number.MAX_SAFE_INTEGER ]));
    });

    for (
        const [ syntaxSizes, evaluations ] of [
            [ [], 1 ],
            [ [ 0 ], 1 ],
            [ [ 2 ], 9 ],
            [ [ 13 ], 196 ],
            [ [ 13, 13 ], 729 ],
            [ [ 180 ], 32_761 ],
            [ [ 181 ], 32_768 ]
        ] as const
    ) {
        test(`limits propagation for syntax sizes ${JSON.stringify(syntaxSizes)}`, function () {
            assert.deepStrictEqual(namespaceDemandLimits(syntaxSizes), {
                maximumQueries: 2048,
                maximumEvaluations: evaluations
            });
        });
    }
});
