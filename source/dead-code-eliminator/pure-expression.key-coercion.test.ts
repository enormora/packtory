import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { isPureExpression } from '../test-libraries/expression-purity-test-support.ts';

suite('pure-expression key coercion', function () {
    const cases = [
        { declaration: 'const key = {};', expected: false },
        { declaration: 'const key = [];', expected: false },
        { declaration: 'const key = /x/;', expected: false },
        { declaration: 'const key = () => {};', expected: false },
        { declaration: 'function key() {}', expected: false },
        { declaration: 'let key = "x";', expected: false },
        { declaration: 'var key = "x";', expected: false },
        { declaration: 'const key = /* @__PURE__ */ factory();', expected: false },
        { declaration: 'const key = /* @__PURE__ */ new Factory();', expected: false },
        { declaration: 'const key = key;', expected: false },
        { declaration: 'const key = other; const other = key;', expected: false },
        { declaration: 'const undefined = undefined; const key = undefined;', expected: false },
        { declaration: 'const key = undefined; const undefined = "x";', expected: false },
        { declaration: 'const key;', expected: false },
        { declaration: 'const key = Symbol(effect());', expected: false },
        { declaration: 'const key = Symbol({ toString() { return "x"; } });', expected: false },
        { declaration: 'const key = Symbol(Symbol());', expected: false },
        { declaration: 'const key = Symbol(...["x"]);', expected: false },
        { declaration: 'const Symbol = () => ({}); const key = /* @__PURE__ */ Symbol();', expected: false },
        { declaration: 'const key = /* @__PURE__ */ factory.Symbol();', expected: false },
        { declaration: 'const key = /* @__PURE__ */ (() => ({}))();', expected: false },
        { declaration: 'import { key } from "external";', expected: false },
        { declaration: 'const key = ("x" as unknown);', expected: true },
        { declaration: 'const key = undefined;', expected: true },
        { declaration: 'const undefined = {}; const key = undefined;', expected: false },
        { declaration: 'const { key } = { key: "x" };', expected: false },
        { declaration: 'const key = missing;', expected: false }
    ];

    for (const scenario of cases) {
        test(`checks key coercion for ${scenario.declaration}`, function () {
            const project = createProject({
                withFiles: [ {
                    filePath: '/source/index.ts',
                    content: `${scenario.declaration}\nconst unused = { [key]: 1 };`
                } ]
            });
            const expression = project
                .getSourceFileOrThrow('/source/index.ts')
                .getVariableDeclarationOrThrow('unused')
                .getInitializerOrThrow();

            assert.strictEqual(isPureExpression(expression, undefined), scenario.expected);
        });
    }

    test('retains a computed key from a loop binding', function () {
        const project = createProject({
            withFiles: [ {
                filePath: '/source/index.js',
                content: 'for (const key of ["x"]) { const unused = { [key]: 1 }; }'
            } ]
        });
        const expression = project
            .getSourceFileOrThrow('/source/index.js')
            .getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);

        assert.strictEqual(isPureExpression(expression, undefined), false);
    });
});
