import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { Expression } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import {
    constantPropertyKeyOfExpression,
    constantValueOfExpression
} from './constant-expression.ts';
import type { ConstantValue } from './constant-value.ts';
import { classifySideEffects } from './side-effect-classifier.ts';

type TestFile = {
    readonly filePath: string;
    readonly content: string;
};

function expressionFrom(content: string, name: string): Expression {
    const project = createProject({ withFiles: [ { filePath: '/project/src/index.ts', content } ] });
    return project
        .getSourceFileOrThrow('/project/src/index.ts')
        .getVariableDeclarationOrThrow(name)
        .getInitializerOrThrow();
}

function expressionFromFiles(files: readonly TestFile[], name: string): Expression {
    const project = createProject({ withFiles: files });
    return project
        .getSourceFileOrThrow('/project/src/index.ts')
        .getVariableDeclarationOrThrow(name)
        .getInitializerOrThrow();
}

function classifyFiles(files: readonly TestFile[]): readonly { readonly line: number; readonly kind: string; }[] {
    const project = createProject({ withFiles: files });
    return classifySideEffects(project.getSourceFileOrThrow('/project/src/index.ts')).map(function (statement) {
        return { line: statement.line, kind: statement.kind };
    });
}

function modulePackageJson(): TestFile {
    return { filePath: '/project/package.json', content: '{"type":"module"}' };
}

function stringValue(value: ConstantValue | undefined): string | undefined {
    return value?.type === 'string' ? value.value : undefined;
}

suite('constant-expression', function () {
    suite('local constants', function () {
        test('constantValueOfExpression resolves property reads from plain object constants', function () {
            const value = constantValueOfExpression(
                expressionFrom('const kinds = { binary: "binary" } as const;\nconst label = kinds.binary;', 'label'),
                undefined
            );

            assert.strictEqual(stringValue(value), 'binary');
        });

        test('constantValueOfExpression resolves nested destructuring from data constants', function () {
            const value = constantValueOfExpression(
                expressionFrom(
                    [
                        'const kinds = { labels: { binary: "binary" }, values: [ "first", "second" ] } as const;',
                        'const { labels: { binary }, values: [ first ] } = kinds;',
                        'const label = binary + ":" + first;'
                    ]
                        .join('\n'),
                    'label'
                ),
                undefined
            );

            assert.strictEqual(stringValue(value), 'binary:first');
        });

        test('constantPropertyKeyOfExpression folds primitive expressions', function () {
            const key = constantPropertyKeyOfExpression(
                expressionFrom([ 'const suffix = "Dependencies";', 'const key = "dev" + suffix;' ].join('\n'), 'key'),
                undefined
            );

            assert.deepStrictEqual(key, { type: 'string', value: 'devDependencies' });
        });

        test('constantPropertyKeyOfExpression accepts opaque Symbol keys', function () {
            const key = constantPropertyKeyOfExpression(
                expressionFrom('const key = Symbol("marker");', 'key'),
                undefined
            );

            assert.strictEqual(key?.type, 'symbol');
        });
    });

    suite('imported constants', function () {
        test('constantValueOfExpression resolves relative ESM constant exports', function () {
            const value = constantValueOfExpression(
                expressionFromFiles(
                    [
                        modulePackageJson(),
                        {
                            filePath: '/project/src/index.ts',
                            content: 'import { kinds } from "./kinds.js";\nconst label = kinds.binary;'
                        },
                        {
                            filePath: '/project/src/kinds.js',
                            content: 'export const kinds = { binary: "binary" };'
                        }
                    ],
                    'label'
                ),
                undefined
            );

            assert.strictEqual(stringValue(value), 'binary');
        });

        test('constantValueOfExpression resolves npm ESM constant exports', function () {
            const value = constantValueOfExpression(
                expressionFromFiles(
                    [
                        {
                            filePath: '/project/src/index.ts',
                            content: 'import { kinds } from "schema-lib";\nconst label = kinds.binary;'
                        },
                        {
                            filePath: '/project/node_modules/schema-lib/package.json',
                            content: '{"type":"module","exports":"./index.js"}'
                        },
                        {
                            filePath: '/project/node_modules/schema-lib/index.js',
                            content: 'export const kinds = { binary: "binary" };'
                        }
                    ],
                    'label'
                ),
                undefined
            );

            assert.strictEqual(stringValue(value), 'binary');
        });

        test('constantValueOfExpression follows common ESM re-exports', function () {
            const value = constantValueOfExpression(
                expressionFromFiles(
                    [
                        modulePackageJson(),
                        {
                            filePath: '/project/src/index.ts',
                            content: 'import { labels } from "./barrel.js";\nconst label = labels.binary;'
                        },
                        {
                            filePath: '/project/src/barrel.js',
                            content: 'export { kinds as labels } from "./kinds.js";'
                        },
                        {
                            filePath: '/project/src/kinds.js',
                            content: 'export const kinds = { binary: "binary" };'
                        }
                    ],
                    'label'
                ),
                undefined
            );

            assert.strictEqual(stringValue(value), 'binary');
        });

        test('constantValueOfExpression rejects CJS package targets', function () {
            const value = constantValueOfExpression(
                expressionFromFiles(
                    [
                        {
                            filePath: '/project/src/index.ts',
                            content: 'import { kinds } from "schema-lib";\nconst label = kinds.binary;'
                        },
                        {
                            filePath: '/project/node_modules/schema-lib/package.json',
                            content: '{"exports":"./index.cjs"}'
                        },
                        {
                            filePath: '/project/node_modules/schema-lib/index.cjs',
                            content: 'exports.kinds = { binary: "binary" };'
                        }
                    ],
                    'label'
                ),
                undefined
            );

            assert.strictEqual(value, undefined);
        });

        test('constantValueOfExpression rejects npm constants from impure import graphs', function () {
            const value = constantValueOfExpression(
                expressionFromFiles(
                    [
                        {
                            filePath: '/project/src/index.ts',
                            content: 'import { kinds } from "schema-lib";\nconst label = kinds.binary;'
                        },
                        {
                            filePath: '/project/node_modules/schema-lib/package.json',
                            content: '{"type":"module","exports":"./index.js"}'
                        },
                        {
                            filePath: '/project/node_modules/schema-lib/index.js',
                            content: 'import "./setup.js";\nexport const kinds = { binary: "binary" };'
                        },
                        {
                            filePath: '/project/node_modules/schema-lib/setup.js',
                            content: 'console.log("setup");'
                        }
                    ],
                    'label'
                ),
                undefined
            );

            assert.strictEqual(value, undefined);
        });
    });

    suite('classifier integration', function () {
        test('classifySideEffects accepts lookup tables keyed by imported constant object members', function () {
            assert.deepStrictEqual(
                classifyFiles([
                    modulePackageJson(),
                    {
                        filePath: '/project/src/index.ts',
                        content: [
                            'import { resultType } from "./result-type.js";',
                            'const headings = {',
                            '  [resultType.config]: "Configuration issues",',
                            '  [resultType.checks]: "Check failures"',
                            '};'
                        ]
                            .join('\n')
                    },
                    {
                        filePath: '/project/src/result-type.js',
                        content: 'export const resultType = { config: "config", checks: "checks" };'
                    }
                ]),
                []
            );
        });

        test('classifySideEffects accepts destructured imported tuples used as computed schema keys', function () {
            assert.deepStrictEqual(
                classifyFiles([
                    modulePackageJson(),
                    {
                        filePath: '/project/src/index.ts',
                        content: [
                            'import { fields } from "./fields.js";',
                            'const [ dependenciesFieldName, devDependenciesFieldName ] = fields;',
                            'const schema = {',
                            '  [dependenciesFieldName]: "dependencies",',
                            '  [devDependenciesFieldName]: "devDependencies"',
                            '};'
                        ]
                            .join('\n')
                    },
                    {
                        filePath: '/project/src/fields.js',
                        content: 'export const fields = [ "dependencies", "devDependencies" ];'
                    }
                ]),
                []
            );
        });

        test('classifySideEffects rejects computed keys that need object coercion', function () {
            assert.deepStrictEqual(
                classifyFiles([
                    {
                        filePath: '/project/src/index.ts',
                        content: [
                            'const key = { toString() { return "x"; } };',
                            'const table = { [key]: "value" };'
                        ]
                            .join('\n')
                    }
                ]),
                [ { line: 2, kind: 'variable initializer' } ]
            );
        });

        test('classifySideEffects rejects default destructuring constants', function () {
            assert.deepStrictEqual(
                classifyFiles([
                    {
                        filePath: '/project/src/index.ts',
                        content: 'const [label = "fallback"] = ["value"];\nconst table = { [label]: "value" };'
                    }
                ]),
                [ { line: 2, kind: 'variable initializer' } ]
            );
        });
    });
});
