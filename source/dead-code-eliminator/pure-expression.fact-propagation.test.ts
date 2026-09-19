import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import { firstVariableInitializerExpression } from '../test-libraries/first-variable-initializer-expression.ts';
import { isPureExpression } from './pure-expression.ts';
import { expressionWithSchemaPackage, variableInitializer } from './pure-expression-test-support.ts';

suite('pure-expression fact propagation', function () {
    test('isPureExpression rejects object spreads of mixed accessor objects', function () {
        assert.strictEqual(
            isPureExpression(
                variableInitializer('const spread = { x: 1, get y() { return 2; } };\nconst a = { ...spread };', 'a'),
                undefined
            ),
            false
        );
    });

    test('isPureExpression rejects object literals with safe properties and unsafe spreads', function () {
        assert.strictEqual(
            isPureExpression(
                variableInitializer('declare const spread: string;\nconst a = { x: 1, ...spread };', 'a'),
                undefined
            ),
            false
        );
    });

    test('isPureExpression rejects cyclic object spread aliases', function () {
        assert.strictEqual(
            isPureExpression(
                variableInitializer(
                    'const first = { ...second };\nconst second = { ...first };\nconst a = { ...first };',
                    'a'
                ),
                undefined
            ),
            false
        );
    });

    test('isPureExpression skips non-value declarations before an import binding', function () {
        assert.strictEqual(
            isPureExpression(
                firstVariableInitializerExpression('interface Foo {}\nimport { Foo } from "lib";\nconst a = Foo;'),
                undefined
            ),
            true
        );
    });

    test('isPureExpression proves aliases to imported external functions', function () {
        const expression = expressionWithSchemaPackage(
            'import { make } from "schema-lib";\nconst build = make;\nconst schema = build();',
            'export function make() { return {}; }'
        );

        assert.strictEqual(isPureExpression(expression, undefined), true);
    });

    test('isPureExpression rejects mutated aliases to imported external functions', function () {
        const expression = expressionWithSchemaPackage(
            [
                'import { make } from "schema-lib";',
                'const build = make;',
                'build.extra = compute;',
                'const schema = build();'
            ]
                .join('\n'),
            'export function make() { return {}; }'
        );

        assert.strictEqual(isPureExpression(expression, undefined), false);
    });

    test('isPureExpression proves external object properties used as spreads', function () {
        const expression = expressionWithSchemaPackage(
            'import { z } from "schema-lib";\nconst schema = { ...z.defaults };',
            'export const z = { defaults: {} };'
        );

        assert.strictEqual(isPureExpression(expression, undefined), true);
    });

    test('isPureExpression rejects unknown external object properties used as spreads', function () {
        const expression = expressionWithSchemaPackage(
            'import { z } from "schema-lib";\nconst schema = { ...z.missing };',
            'export const z = {};'
        );

        assert.strictEqual(isPureExpression(expression, undefined), false);
    });

    test('isPureExpression treats trusted import property access as a spreadable object', function () {
        const settings: DeadCodeEliminationSettings = { enabled: true, pureImports: [ { from: 'lib' } ] };
        const expression = firstVariableInitializerExpression('import * as ns from "lib";\nconst a = { ...ns.x };');

        assert.strictEqual(isPureExpression(expression, settings), true);
    });
});
