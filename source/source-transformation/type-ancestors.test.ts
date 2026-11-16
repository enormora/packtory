import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { createTypeAncestorAnalysis, hasTypeAncestor } from './type-ancestors.ts';

suite('type ancestor analysis', function () {
    test('shares parent traversal across siblings and repeated queries', function () {
        const source = createProject().createSourceFile(
            'input.ts',
            `function read(){${'{'.repeat(64)}return [${
                Array
                    .from({ length: 256 }, function () {
                        return 'value';
                    })
                    .join(',')
            }];${'}'.repeat(64)}}`
        );
        const identifiers = source.getDescendantsOfKind(SyntaxKind.Identifier);
        let parentReads = 0;
        const analyze = createTypeAncestorAnalysis(function (node) {
            parentReads += 1;
            return node.getParent();
        }, new WeakMap());
        assert.ok(identifiers.every(function (identifier) {
            return !analyze(identifier);
        }));
        const initialReads = parentReads;
        assert.ok(identifiers.every(function (identifier) {
            return !analyze(identifier);
        }));
        assert.ok(initialReads <= 400, `Shared ancestry required ${initialReads} parent reads`);
        assert.strictEqual(parentReads, initialReads);
    });

    test('keeps type ancestry separate from runtime siblings and the type node itself', function () {
        const source = createProject().createSourceFile('input.ts', 'type Value=typeof value; value;');
        const query = source.getFirstDescendantByKindOrThrow(SyntaxKind.TypeQuery);
        assert.strictEqual(hasTypeAncestor(query), false);
        const identifiers = source.getDescendantsOfKind(SyntaxKind.Identifier);
        assert.deepStrictEqual(identifiers.map(hasTypeAncestor), [ false, true, false ]);
        assert.deepStrictEqual(identifiers.toReversed().map(hasTypeAncestor), [ false, true, false ]);
    });

    test('updates ancestry after the source changes', function () {
        const source = createProject().createSourceFile('input.ts', 'value;');
        assert.strictEqual(hasTypeAncestor(source.getFirstDescendantByKindOrThrow(SyntaxKind.Identifier)), false);
        source.replaceWithText('type Value=typeof value;');
        const query = source.getFirstDescendantByKindOrThrow(SyntaxKind.TypeQuery);
        assert.strictEqual(hasTypeAncestor(query.getFirstDescendantByKindOrThrow(SyntaxKind.Identifier)), true);
    });
});
