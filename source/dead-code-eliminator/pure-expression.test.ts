import assert from 'node:assert';
import path from 'node:path';
import { suite, test } from 'mocha';
import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget, SyntaxKind, type Expression } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import { firstVariableInitializerExpression } from '../test-libraries/first-variable-initializer-expression.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { isPureExpression } from './pure-expression.ts';

function initializerFromProjectFiles(
    files: readonly { readonly filePath: string; readonly content: string; }[]
): Expression {
    const project = createProject({ withFiles: files });
    return project
        .getSourceFileOrThrow('/project/src/index.ts')
        .getVariableDeclarationOrThrow('schema')
        .getInitializerOrThrow();
}

function initializerFromRealProject(content: string): Expression {
    const project = new Project({
        compilerOptions: {
            allowJs: true,
            esModuleInterop: true,
            module: ModuleKind.Node16,
            moduleResolution: ModuleResolutionKind.Node16,
            target: ScriptTarget.ES2022
        },
        skipLoadingLibFiles: true
    });
    const sourceFile = project.createSourceFile(path.join(process.cwd(), 'target/dce-zod-entry.ts'), content, {
        overwrite: true
    });
    return sourceFile.getVariableDeclarationOrThrow('schema').getInitializerOrThrow();
}

function variableInitializer(content: string, name: string): Expression {
    const project = createProject({ withFiles: [ { filePath: 'index.ts', content } ] });
    const declarations = project.getSourceFileOrThrow('index.ts').getDescendantsOfKind(SyntaxKind.VariableDeclaration);
    const declaration = declarations.find(function (candidate) {
        return candidate.getName() === name;
    });
    if (declaration === undefined) {
        assert.fail(`expected variable declaration "${name}"`);
    }
    return declaration.getInitializerOrThrow();
}

suite('pure-expression', function () {
    suite('literal and array purity', function () {
        test('isPureExpression returns true for a primitive literal', function () {
            assert.strictEqual(isPureExpression(firstVariableInitializerExpression('const a = 1;'), undefined), true);
        });

        test('isPureExpression returns true for a function expression', function () {
            assert.strictEqual(
                isPureExpression(firstVariableInitializerExpression('const a = function () {};'), undefined),
                true
            );
        });

        test('isPureExpression returns true for an array literal of pure elements', function () {
            assert.strictEqual(
                isPureExpression(firstVariableInitializerExpression('const a = [1, "x", true];'), undefined),
                true
            );
        });

        test('isPureExpression returns false for an array literal containing a non-pure call', function () {
            assert.strictEqual(
                isPureExpression(firstVariableInitializerExpression('const a = [Math.random()];'), undefined),
                false
            );
        });
    });

    suite('object and expression purity', function () {
        test('isPureExpression returns true for an object literal of pure assignments', function () {
            assert.strictEqual(
                isPureExpression(
                    firstVariableInitializerExpression('const a = { x: 1, get y() { return 2; } };'),
                    undefined
                ),
                true
            );
        });

        test('isPureExpression returns false for an object literal with an impure computed property name', function () {
            assert.strictEqual(
                isPureExpression(firstVariableInitializerExpression('const a = { [compute()]: 1 };'), undefined),
                false
            );
        });

        test('isPureExpression returns false for an object literal with an impure computed method name', function () {
            assert.strictEqual(
                isPureExpression(
                    firstVariableInitializerExpression('const a = { [compute()]() { return 1; } };'),
                    undefined
                ),
                false
            );
        });

        test('isPureExpression returns false for an object literal with an impure computed accessor name', function () {
            assert.strictEqual(
                isPureExpression(
                    firstVariableInitializerExpression(
                        'const a = { get [compute()]() { return 1; }, set value(input) {} };'
                    ),
                    undefined
                ),
                false
            );
        });

        test('isPureExpression returns true for an object literal with a pure spread value', function () {
            assert.strictEqual(
                isPureExpression(
                    firstVariableInitializerExpression('const spread = { x: 1 };\nconst a = { ...spread };'),
                    undefined
                ),
                true
            );
        });
    });

    suite('operator and call purity', function () {
        test('isPureExpression returns true for a strict-equality binary expression of pure operands', function () {
            assert.strictEqual(
                isPureExpression(firstVariableInitializerExpression('const a = 1 === 2;'), undefined),
                true
            );
        });

        test('isPureExpression returns false for a binary expression with a disallowed operator', function () {
            assert.strictEqual(
                isPureExpression(firstVariableInitializerExpression('const a = 1 == 2;'), undefined),
                false
            );
        });

        test('isPureExpression returns false for a call expression to an unknown function', function () {
            assert.strictEqual(
                isPureExpression(
                    firstVariableInitializerExpression('declare const f: () => number;\nconst a = f();'),
                    undefined
                ),
                false
            );
        });
    });

    suite('identifier purity', function () {
        test('isPureExpression returns false for an unresolved identifier read', function () {
            assert.strictEqual(
                isPureExpression(firstVariableInitializerExpression('const a = missing;'), undefined),
                false
            );
        });

        test('isPureExpression returns false for an identifier bound only to a type alias', function () {
            assert.strictEqual(
                isPureExpression(
                    firstVariableInitializerExpression('type MissingValue = string;\nconst a = MissingValue;'),
                    undefined
                ),
                false
            );
        });

        test('isPureExpression returns false for an identifier bound only to a declared namespace', function () {
            assert.strictEqual(
                isPureExpression(
                    firstVariableInitializerExpression(
                        'declare namespace MissingValue { const x: string; }\nconst a = MissingValue;'
                    ),
                    undefined
                ),
                false
            );
        });

        test('isPureExpression returns false for a temporal-dead-zone identifier read', function () {
            const expression = firstVariableInitializerExpression('const a = later;\nconst later = 1;');

            assert.strictEqual(isPureExpression(expression, undefined), false);
        });
    });

    suite('available identifier purity', function () {
        test('isPureExpression returns true for an earlier local variable read', function () {
            const expression = firstVariableInitializerExpression('const previous = 1;\nconst a = previous;');

            assert.strictEqual(isPureExpression(expression, undefined), true);
        });

        test('isPureExpression returns true for an earlier local class read', function () {
            const expression = firstVariableInitializerExpression('class Previous {}\nconst a = Previous;');

            assert.strictEqual(isPureExpression(expression, undefined), true);
        });

        test('isPureExpression returns true for an earlier local enum read', function () {
            const expression = firstVariableInitializerExpression('enum Previous { Value }\nconst a = Previous;');

            assert.strictEqual(isPureExpression(expression, undefined), true);
        });

        test('isPureExpression returns true for a hoisted function declaration read', function () {
            const expression = firstVariableInitializerExpression('const a = make;\nfunction make() { return 1; }');

            assert.strictEqual(isPureExpression(expression, undefined), true);
        });

        test('isPureExpression returns true for import and namespace import reads', function () {
            assert.strictEqual(
                isPureExpression(
                    firstVariableInitializerExpression('import value from "lib";\nconst a = value;'),
                    undefined
                ),
                true
            );
            assert.strictEqual(
                isPureExpression(
                    firstVariableInitializerExpression('import * as namespace from "lib";\nconst a = namespace;'),
                    undefined
                ),
                true
            );
        });

        test('isPureExpression returns true for a parameter read', function () {
            const expression = variableInitializer(
                'function build(input: string) { const schema = input; return schema; }',
                'schema'
            );

            assert.strictEqual(isPureExpression(expression, undefined), true);
        });

        test('isPureExpression returns true for the undefined identifier', function () {
            const expression = firstVariableInitializerExpression('const a = undefined;');

            assert.strictEqual(isPureExpression(expression, undefined), true);
        });
    });

    suite('annotated call purity', function () {
        test('isPureExpression returns true for a pure-annotated call with pure arguments', function () {
            assert.strictEqual(
                isPureExpression(
                    firstVariableInitializerExpression(
                        'declare const f: () => number;\nconst a = /* @__PURE__ */ f(1);'
                    ),
                    undefined
                ),
                true
            );
        });

        test('isPureExpression returns false for a pure-annotated call with an impure argument', function () {
            assert.strictEqual(
                isPureExpression(
                    firstVariableInitializerExpression(
                        'declare const f: (value: number) => number;\ndeclare const g: () => number;\nconst a = /* @__PURE__ */ f(g());'
                    ),
                    undefined
                ),
                false
            );
        });
    });

    suite('trusted import purity', function () {
        suite('external ESM purity', function () {
            test('isPureExpression returns true for a call to an automatically proven external ESM builder', function () {
                const expression = initializerFromProjectFiles([
                    {
                        filePath: '/project/src/index.ts',
                        content: 'import { z } from "schema-lib";\nconst schema = z.object({ value: z.string() });'
                    },
                    {
                        filePath: '/project/node_modules/schema-lib/package.json',
                        content: '{"name":"schema-lib","type":"module","exports":"./index.js"}'
                    },
                    {
                        filePath: '/project/node_modules/schema-lib/index.js',
                        content: 'export const z = { string() { return {}; }, object(shape) { return {}; } };'
                    }
                ]);

                assert.strictEqual(isPureExpression(expression, undefined), true);
            });

            test('isPureExpression returns true for zod mini schema construction through runtime ESM resolution', function () {
                const expression = initializerFromRealProject(
                    'import { z } from "zod/mini";\nconst schema = z.object({ value: z.string() });'
                );

                assert.strictEqual(isPureExpression(expression, undefined), true);
            });

            test('isPureExpression returns false for an external ESM builder whose implementation is not proven pure', function () {
                const expression = initializerFromProjectFiles([
                    {
                        filePath: '/project/src/index.ts',
                        content: 'import { z } from "schema-lib";\nconst schema = z.object({ value: z.string() });'
                    },
                    {
                        filePath: '/project/node_modules/schema-lib/package.json',
                        content: '{"name":"schema-lib","type":"module","exports":"./index.js"}'
                    },
                    {
                        filePath: '/project/node_modules/schema-lib/index.js',
                        content: 'export const z = { string() { return compute(); }, object(shape) { return {}; } };'
                    }
                ]);

                assert.strictEqual(isPureExpression(expression, undefined), false);
            });

            test('isPureExpression proves direct external function calls', function () {
                const expression = initializerFromProjectFiles([
                    {
                        filePath: '/project/src/index.ts',
                        content: 'import { make } from "schema-lib";\nconst schema = make();'
                    },
                    {
                        filePath: '/project/node_modules/schema-lib/package.json',
                        content: '{"name":"schema-lib","type":"module","exports":"./index.js"}'
                    },
                    {
                        filePath: '/project/node_modules/schema-lib/index.js',
                        content: 'export function make() { return {}; }'
                    }
                ]);

                assert.strictEqual(isPureExpression(expression, undefined), true);
            });

            test('isPureExpression proves fluent calls returned from pure external object builders', function () {
                const expression = initializerFromProjectFiles([
                    {
                        filePath: '/project/src/index.ts',
                        content:
                            'import { z } from "schema-lib";\nconst schema = z.object({}).extend({ value: z.string() });'
                    },
                    {
                        filePath: '/project/node_modules/schema-lib/package.json',
                        content: '{"name":"schema-lib","type":"module","exports":"./index.js"}'
                    },
                    {
                        filePath: '/project/node_modules/schema-lib/index.js',
                        content: [
                            'export const z = {',
                            '  string() { return {}; },',
                            '  object(shape) { return { extend(extra) { return {}; } }; }',
                            '};'
                        ]
                            .join('\n')
                    }
                ]);

                assert.strictEqual(isPureExpression(expression, undefined), true);
            });

            test('isPureExpression rejects fluent external calls when the returned method is not proven pure', function () {
                const expression = initializerFromProjectFiles([
                    {
                        filePath: '/project/src/index.ts',
                        content: 'import { z } from "schema-lib";\nconst schema = z.object({}).parse({});'
                    },
                    {
                        filePath: '/project/node_modules/schema-lib/package.json',
                        content: '{"name":"schema-lib","type":"module","exports":"./index.js"}'
                    },
                    {
                        filePath: '/project/node_modules/schema-lib/index.js',
                        content: 'export const z = { object(shape) { return { extend(extra) { return {}; } }; } };'
                    }
                ]);

                assert.strictEqual(isPureExpression(expression, undefined), false);
            });
        });

        suite('configured import and built-in purity', function () {
            test('isPureExpression returns true for a call to a function imported from a trusted pureImports entry', function () {
                const settings: DeadCodeEliminationSettings = { enabled: true, pureImports: [ { from: 'lib' } ] };
                const expression = firstVariableInitializerExpression('import { x } from "lib";\nconst a = x();');

                assert.strictEqual(isPureExpression(expression, settings), true);
            });

            test('isPureExpression matches trusted imports against the imported property path head', function () {
                const settings: DeadCodeEliminationSettings = {
                    enabled: true,
                    pureImports: [ { from: 'lib', imports: [ 'x' ] } ]
                };
                const expression = firstVariableInitializerExpression(
                    'import * as ns from "lib";\nconst a = ns.x.y();'
                );

                assert.strictEqual(isPureExpression(expression, settings), true);
            });

            test('isPureExpression returns true for a Symbol call with pure arguments', function () {
                const expression = firstVariableInitializerExpression('const a = Symbol("x");');

                assert.strictEqual(isPureExpression(expression, undefined), true);
            });

            test('isPureExpression returns false for a Symbol call with an impure argument', function () {
                const expression = firstVariableInitializerExpression(
                    'declare const f: () => string;\nconst a = Symbol(f());'
                );

                assert.strictEqual(isPureExpression(expression, undefined), false);
            });

            test('isPureExpression returns true for a new expression of a trusted pureConstructor name', function () {
                const settings: DeadCodeEliminationSettings = { enabled: true, pureConstructors: [ 'Foo' ] };
                const expression = firstVariableInitializerExpression('declare class Foo {}\nconst a = new Foo();');

                assert.strictEqual(isPureExpression(expression, settings), true);
            });

            test('isPureExpression returns false for a new expression whose constructor name is not on the trusted list', function () {
                const settings: DeadCodeEliminationSettings = { enabled: true, pureConstructors: [ 'Foo' ] };
                const expression = firstVariableInitializerExpression('declare class Bar {}\nconst a = new Bar();');

                assert.strictEqual(isPureExpression(expression, settings), false);
            });
        });
    });
});
