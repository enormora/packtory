import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { fileBindingsFor } from '../../test-libraries/reachability-test-support.ts';
import { observeReachableBindings } from './binding-observation.ts';

suite('binding observation', function () {
    test('observes a shared declaration when any of its bindings is reachable', function () {
        const file = fileBindingsFor('/source/index.js', 'const {first,second}=value;');
        const initializer = file
            .sourceFile
            .getFirstDescendantByKindOrThrow(SyntaxKind.VariableDeclaration)
            .getInitializerOrThrow();
        assert.strictEqual(
            observeReachableBindings([ file ], new Set([ '/source/index.js::second' ]))(initializer),
            true
        );
        assert.strictEqual(observeReachableBindings([ file ], new Set())(initializer), false);
    });
});
