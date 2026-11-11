import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind, type VariableDeclaration } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { localBindingReferences } from '../reference-target.ts';
import { createNamespaceReadObservation } from './namespace-read-observation.ts';

suite('namespace read observation', function () {
    test('does not treat an element key as its namespace receiver', function () {
        const source = createProject().createSourceFile('input.ts', 'object["key"];');
        const key = source
            .getFirstDescendantByKindOrThrow(SyntaxKind.ElementAccessExpression)
            .getArgumentExpressionOrThrow();
        const observation = createNamespaceReadObservation(localBindingReferences);
        assert.strictEqual(observation.observe(key), false);
        assert.deepStrictEqual(observation.properties, new Set());
    });

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
            { content: 'const ns=1;', expected: false, properties: [] },
            { content: 'ns["used"];', expected: true, properties: [ 'used' ] },
            { content: 'ns[`used`];', expected: true, properties: [ 'used' ] },
            { content: 'ns[0x2a];', expected: true, properties: [ '42' ] },
            { content: 'ns[key];', expected: false, properties: [] },
            { content: 'ns[];', expected: false, properties: [] }
        ]
    ) {
        test(`observes namespace receiver boundaries for ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const value = source.getDescendantsOfKind(SyntaxKind.Identifier).find(function (identifier) {
                return identifier.getText() === 'ns';
            });
            assertDefined(value);
            const observation = createNamespaceReadObservation(localBindingReferences);
            assert.strictEqual(observation.observe(value), expected);
            assert.deepStrictEqual(observation.properties, new Set(properties));
        });
    }

    test('keeps an escaped namespace unknown on repeated observation', function () {
        const source = createProject().createSourceFile('input.ts', 'const alias=ns;consume(alias);');
        const value = source.getVariableDeclarationOrThrow('alias').getInitializerOrThrow();
        const observation = createNamespaceReadObservation(localBindingReferences);
        assert.strictEqual(observation.observe(value), false);
        assert.strictEqual(observation.observe(value), false);
    });

    test('reuses observations of shared aliases without losing property reads', function () {
        const source = createProject().createSourceFile('input.ts', 'const alias=ns;alias.used;alias.other;');
        const value = source.getVariableDeclarationOrThrow('alias').getInitializerOrThrow();
        const observation = createNamespaceReadObservation(localBindingReferences);
        assert.strictEqual(observation.observe(value), true);
        assert.strictEqual(observation.observe(value), true);
        assert.deepStrictEqual(observation.properties, new Set([ 'used', 'other' ]));
    });

    test('visits each binding once while resolving cyclic aliases', function () {
        const source = createProject().createSourceFile(
            'input.ts',
            'const first=ns;const second=first;const ns=second;first.used;'
        );
        const value = source.getVariableDeclarationOrThrow('first').getInitializerOrThrow();
        const visited = new Set<VariableDeclaration>();
        const observation = createNamespaceReadObservation(function (name, declaration) {
            assert.strictEqual(visited.has(declaration), false);
            visited.add(declaration);
            return localBindingReferences(name, declaration);
        });
        assert.strictEqual(observation.observe(value), true);
        assert.strictEqual(observation.observe(value), true);
        assert.strictEqual(visited.size, 3);
        assert.deepStrictEqual(observation.properties, new Set([ 'used' ]));
    });
});
