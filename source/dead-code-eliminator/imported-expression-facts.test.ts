import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createExportModuleFixture } from '../test-libraries/export-module-fixture.ts';
import { pureObjectWithOrigin, unknownFact } from './expression-facts.ts';
import { propertyAccessExpressionFact } from './imported-expression-facts.ts';
import { resolveRuntimeModule } from './runtime-module-resolution.ts';

suite('imported expression facts', function () {
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
