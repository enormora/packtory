import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createSourceEvaluation } from './constant-evaluation.ts';
import { createInitializedImportOrigin } from './initialized-import-origin.ts';

suite('initialized import origins', function () {
    for (const access of [ '.value', '["value"]' ]) {
        for (const [ count, known ] of [ [ 30, true ], [ 31, false ] ] as const) {
            test(`bounds ${count} property projections through ${access}`, function () {
                const source = createProject().createSourceFile(
                    'input.js',
                    `import * as ns from "./dep.js";const alias=ns;const result=alias${access.repeat(count)};`
                );
                const origin = createInitializedImportOrigin(createSourceEvaluation(source).primitiveValue);
                assert.deepStrictEqual(
                    origin(source.getVariableDeclarationOrThrow('result').getInitializerOrThrow()),
                    known
                        ? {
                            from: './dep.js',
                            path: Array.from({ length: count }, function () {
                                return 'value';
                            })
                        }
                        : undefined
                );
            });
        }
    }

    test('follows a static property through an initialized namespace alias', function () {
        const source = createProject().createSourceFile(
            'index.ts',
            'import * as ns from "./dep.js";const alias=ns;const result=alias.value;'
        );
        const origin = createInitializedImportOrigin(createSourceEvaluation(source).primitiveValue);
        assert.deepStrictEqual(origin(source.getVariableDeclarationOrThrow('result').getInitializerOrThrow()), {
            from: './dep.js',
            path: [ 'value' ]
        });
    });
    for (
        const content of [
            'declare const alias:number;const result=alias;',
            'const alias;const result=alias;',
            'const result=missing().value;',
            'const result=missing()["value"];',
            'import * as ns from "./dep.js";const result=ns[];'
        ]
    ) {
        test(`rejects an unproved origin in ${content}`, function () {
            const source = createProject().createSourceFile('index.ts', content);
            const origin = createInitializedImportOrigin(createSourceEvaluation(source).primitiveValue);
            assert.strictEqual(
                origin(source.getVariableDeclarationOrThrow('result').getInitializerOrThrow()),
                undefined
            );
        });
    }

    for (const [ count, known ] of [ [ 31, true ], [ 32, false ] ] as const) {
        test(`bounds alias traversal at ${count} declarations`, function () {
            const declarations = Array.from({ length: count }, function (_value, index) {
                const previous = index === 0 ? 'ns' : `alias${index - 1}`;
                return `const alias${index}=${previous};`;
            });
            const content = `import * as ns from "./dep.js";${declarations.join('')}const result=alias${count - 1};`;
            const source = createProject().createSourceFile('index.ts', content);
            const origin = createInitializedImportOrigin(createSourceEvaluation(source).primitiveValue);
            assert.deepStrictEqual(
                origin(source.getVariableDeclarationOrThrow('result').getInitializerOrThrow()),
                known ? { from: './dep.js', path: [] } : undefined
            );
        });
    }
});
