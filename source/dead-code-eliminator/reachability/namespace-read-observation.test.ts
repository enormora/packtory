import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createNamespaceReadObservation } from './namespace-read-observation.ts';

suite('namespace read observation', function () {
    test('keeps an escaped namespace unknown on repeated observation', function () {
        const source = createProject().createSourceFile('input.ts', 'const alias=ns;consume(alias);');
        const value = source.getVariableDeclarationOrThrow('alias').getInitializerOrThrow();
        const observation = createNamespaceReadObservation();
        assert.strictEqual(observation.observe(value), false);
        assert.strictEqual(observation.observe(value), false);
    });

    test('reuses observations of shared aliases without losing property reads', function () {
        const source = createProject().createSourceFile('input.ts', 'const alias=ns;alias.used;alias.other;');
        const value = source.getVariableDeclarationOrThrow('alias').getInitializerOrThrow();
        const observation = createNamespaceReadObservation();
        assert.strictEqual(observation.observe(value), true);
        assert.strictEqual(observation.observe(value), true);
        assert.deepStrictEqual(observation.properties, new Set([ 'used', 'other' ]));
    });
});
