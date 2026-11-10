import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createNamespaceReadObservation } from './namespace-read-observation.ts';

suite('namespace read observation', function () {
    for (
        const { content, expected, properties } of [
            { content: 'consume(ns.used);', expected: true, properties: [ 'used' ] },
            { content: [ 'tag`$', '{ns.used}`;' ].join(''), expected: true, properties: [ 'used' ] },
            { content: 'ns.used();', expected: false, properties: [] },
            { content: 'ns.used``;', expected: false, properties: [] },
            { content: 'export const alias=ns;alias.used;', expected: false, properties: [] },
            { content: 'let alias=ns;alias.used;', expected: false, properties: [] },
            { content: 'const {alias}=ns;', expected: false, properties: [] },
            { content: 'object.ns;', expected: false, properties: [] },
            { content: 'object[ns];', expected: false, properties: [] },
            { content: 'const ns=1;', expected: false, properties: [] }
        ]
    ) {
        test(`observes namespace receiver boundaries for ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const value = source.getDescendantsOfKind(SyntaxKind.Identifier).find(function (identifier) {
                return identifier.getText() === 'ns';
            });
            assertDefined(value);
            const observation = createNamespaceReadObservation();
            assert.strictEqual(observation.observe(value), expected);
            assert.deepStrictEqual(observation.properties, new Set(properties));
        });
    }

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
