import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createExportModuleFixture } from '../test-libraries/export-module-fixture.ts';
import { pureCallableWithOrigin, pureObjectWithOrigin, unknownFact } from './expression-facts.ts';
import { propertyAccessExpressionFact } from './imported-expression-facts.ts';
import { resolveRuntimeModule } from './runtime-module-resolution.ts';

suite('imported expression facts', function () {
    test('retains a callable fact for an externally exported function', function () {
        const fixture = createExportModuleFixture({
            'index.js': 'import * as library from "./library.js";const result=library.create;',
            'library.js': 'export function create(){return 42;}'
        }, []);
        const expression = fixture.source('index.js').getVariableDeclarationOrThrow('result').getInitializerOrThrow();

        assert.deepStrictEqual(
            propertyAccessExpressionFact(expression, function () {
                return unknownFact;
            }, { settings: undefined, resolveRuntimeModule }),
            pureCallableWithOrigin({ from: './library.js', path: [ 'create' ] })
        );
    });

    test('rejects a property origin after the receiver escapes', function () {
        const fixture = createExportModuleFixture({
            'index.js': 'const local={};mutate(local);const result=local.member;',
            'library.js': 'export const api={member(){return 1;}};'
        }, []);
        const expression = fixture.source('index.js').getVariableDeclarationOrThrow('result').getInitializerOrThrow();
        const fact = propertyAccessExpressionFact(expression, function () {
            return pureObjectWithOrigin({ from: './library.js', path: [ 'api' ] });
        }, { settings: undefined, resolveRuntimeModule });
        assert.deepStrictEqual(fact, unknownFact);
    });
});
