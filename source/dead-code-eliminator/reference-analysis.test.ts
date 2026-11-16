import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind, type Identifier } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { bindingReferenceTargets } from './reference-target.ts';

type ReferenceQueries = { readonly name: Identifier; readonly queries: () => number; };

function observeReferenceQueries(name: Identifier): ReferenceQueries {
    let queries = 0;
    return {
        name: new Proxy(name, {
            get(target, property) {
                if (property === 'findReferences') {
                    return function () {
                        queries += 1;
                        return target.findReferences();
                    };
                }
                const value: unknown = Reflect.get(target, property, target);
                if (typeof value !== 'function') {
                    return value;
                }
                return function (...methodArguments: readonly unknown[]): unknown {
                    return Reflect.apply(value, target, methodArguments);
                };
            }
        }),
        queries() {
            return queries;
        }
    };
}

suite('binding reference analysis', function () {
    test('queries unchanged programs once and observes edits in other sources', function () {
        const project = createProject();
        const source = project.createSourceFile('/source/provider.js', 'export const value=1;');
        const consumer = project.createSourceFile('/source/index.js', 'import {value} from "./provider.js";value;');
        const observed = observeReferenceQueries(
            source
                .getVariableDeclarationOrThrow('value')
                .getNameNode()
                .asKindOrThrow(SyntaxKind.Identifier)
        );
        for (let iteration = 0; iteration < 64; iteration += 1) {
            assert.deepStrictEqual(
                bindingReferenceTargets(observed.name).map(function (reference) {
                    return reference.getText();
                }),
                [ 'value', 'value', 'value' ]
            );
        }
        assert.strictEqual(observed.queries(), 1);
        consumer.replaceWithText('export {};');
        assert.deepStrictEqual(bindingReferenceTargets(observed.name), [
            source
                .getVariableDeclarationOrThrow('value')
                .getNameNode()
        ]);
        assert.strictEqual(observed.queries(), 2);
    });

    test('refreshes references after editing the binding source', function () {
        const source = createProject().createSourceFile('/source/index.js', 'const value=1;value;');
        const before = source.getVariableDeclarationOrThrow('value').getNameNode().asKindOrThrow(SyntaxKind.Identifier);
        assert.strictEqual(bindingReferenceTargets(before).length, 2);
        source.replaceWithText('const value=2;value;value;');
        const after = source.getVariableDeclarationOrThrow('value').getNameNode().asKindOrThrow(SyntaxKind.Identifier);
        assert.strictEqual(bindingReferenceTargets(after).length, 3);
    });
});
