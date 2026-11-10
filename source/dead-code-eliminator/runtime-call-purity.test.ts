import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createExportModuleFixture } from '../test-libraries/export-module-fixture.ts';
import { expressionWithSchemaPackage } from './pure-expression-test-support.ts';
import { resolveRuntimeModule } from './runtime-module-resolution.ts';
import { createRuntimeCallablePurityProof } from './runtime-call-purity.ts';

const cases: readonly (readonly [string, string, boolean])[] = [
    [
        'import { make } from "schema-lib"; const schema = make();',
        'export function make() { return {}; }',
        true
    ],
    [
        'import * as library from "schema-lib"; const make = library.factory.make; const schema = make();',
        'export const factory = { make() { return {}; } };',
        true
    ],
    [
        'import { make } from "schema-lib"; const schema = make().method();',
        'export function make() { return { method() { return {}; } }; }',
        true
    ],
    [
        'import { make } from "schema-lib"; let alias = make; const schema = alias();',
        'export function make() { return {}; }',
        false
    ],
    [ 'const make = make; const schema = make();', 'export const other = 1;', false ],
    [ 'function make() { return 1; } const schema = make();', 'export const other = 1;', false ],
    [
        'import { make } from "missing"; const schema = make();',
        'export function make() { return {}; }',
        false
    ],
    [
        'import { make } from "schema-lib"; const schema = make();',
        'export function make() { console.log("effect"); return {}; }',
        false
    ],
    [
        'import { make } from "schema-lib"; const schema = (0, make)();',
        'export function make() { return {}; }',
        false
    ],
    [
        'const make = { method() { return {}; } }; const schema = make.method();',
        'export const other = 1;',
        false
    ],
    [ 'declare const make: () => object; const schema = make();', 'export const other = 1;', false ]
];

suite('runtime callable purity proofs', function () {
    test('does not follow a loop-scoped constant as a stable alias', function () {
        const fixture = createExportModuleFixture({
            'index.js': 'import {make} from "./library.js";for(const alias of [make]){alias();}',
            'library.js': 'export function make(){return 1;}'
        }, []);
        const call = fixture.source('index.js').getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
        assert.strictEqual(createRuntimeCallablePurityProof(resolveRuntimeModule)(call.getExpression()), false);
    });

    for (const [ content, dependency, expected ] of cases) {
        test(`resolves the runtime target in ${content}`, function () {
            const expression = expressionWithSchemaPackage(content, dependency).asKindOrThrow(
                SyntaxKind.CallExpression
            );
            assert.strictEqual(
                createRuntimeCallablePurityProof(resolveRuntimeModule)(expression.getExpression()),
                expected
            );
        });
    }
});
