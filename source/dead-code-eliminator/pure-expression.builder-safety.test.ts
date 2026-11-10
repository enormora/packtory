import assert from 'node:assert';
import { suite, test } from 'mocha';
import { isPureExpression } from '../test-libraries/expression-purity-test-support.ts';
import { expressionWithSchemaPackage } from './pure-expression-test-support.ts';

suite('builder proof safety', function () {
    for (const returned of [ 'value', '{ value }', '{ stored: value }', '[value]' ]) {
        test(`proves initialized parameter reads in ${returned}`, function () {
            const expression = expressionWithSchemaPackage(
                'import { make } from "schema-lib"; function compute() { return 1; } const schema = make(compute());',
                `export function make(value) { return ${returned}; }`
            );
            assert.strictEqual(isPureExpression(expression, undefined), true);
        });
    }

    test('distinguishes a function property from a returned object property', function () {
        const expression = expressionWithSchemaPackage(
            'import { make } from "schema-lib"; function compute() { return 1; } const schema = make.method(compute());',
            'export const make = () => ({ method() { return {}; } });'
        );
        assert.strictEqual(isPureExpression(expression, undefined), false);
    });

    test('distinguishes dotted property names from nested accesses', function () {
        const expression = expressionWithSchemaPackage(
            'import { make } from "schema-lib"; function compute() { return 1; } const schema = make.method.deep(compute());',
            'export const make = { "method.deep"() { return {}; } };'
        );
        assert.strictEqual(isPureExpression(expression, undefined), false);
    });

    const unknownBuilders = [
        'export function make() { return { value: console.log("effect") }; }',
        'export function make(value = console.log("effect")) { return {}; }',
        'export function make({ value }) { return {}; }',
        'export function make() { return [...missing]; }',
        'export async function make() { return { get then() { console.log("effect"); } }; }'
    ];

    for (const implementation of unknownBuilders) {
        test(`preserves calls to ${implementation}`, function () {
            const expression = expressionWithSchemaPackage(
                'import { make } from "schema-lib"; function compute() { return null; } const schema = make(compute());',
                implementation
            );
            assert.strictEqual(isPureExpression(expression, undefined), false);
        });
    }

    test('preserves getters on builder results that are spread', function () {
        const expression = expressionWithSchemaPackage(
            'import { make } from "schema-lib"; function compute() { return 1; } const schema = { ...make(compute()) };',
            'export function make() { return { get value() { console.log("get"); return 1; }, method() { return {}; } }; }'
        );
        assert.strictEqual(isPureExpression(expression, undefined), false);
    });

    test('can remove a getter-producing call when its result is never observed', function () {
        const expression = expressionWithSchemaPackage(
            'import { make } from "schema-lib"; function compute() { return 1; } const schema = make(compute());',
            'export function make() { return { get value() { console.log("get"); return 1; } }; }'
        );
        assert.strictEqual(isPureExpression(expression, undefined), true);
    });
});
