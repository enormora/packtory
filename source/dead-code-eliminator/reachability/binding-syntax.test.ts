import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { SourceFile } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { readBindingSyntax, type BindingSyntaxNode } from './binding-syntax.ts';

type ObservedSyntax = {
    readonly node: BindingSyntaxNode;
    readonly queryCount: () => number;
};

function observeSyntaxQueries(source: SourceFile): ObservedSyntax {
    let queries = 0;
    return {
        node: {
            get compilerNode() {
                return source.compilerNode;
            },
            getSourceFile() {
                return source;
            },
            getDescendantsOfKind(kind) {
                queries += 1;
                return source.getDescendantsOfKind(kind);
            }
        },
        queryCount() {
            return queries;
        }
    };
}

suite('binding syntax observations', function () {
    test('collects identifiers, calls, and shorthand properties in source order', function () {
        const source = createProject().createSourceFile(
            'input.ts',
            'const value=1; const object={value}; export function read(){return value+compute("x");}'
        );
        const syntax = readBindingSyntax(source);
        assert.deepStrictEqual(
            syntax.identifiers.map(function (node) {
                return node.getText();
            }),
            [
                'value',
                'object',
                'value',
                'read',
                'value',
                'compute'
            ]
        );
        assert.deepStrictEqual(
            syntax.calls.map(function (node) {
                return node.getText();
            }),
            [ 'compute("x")' ]
        );
        assert.deepStrictEqual(
            syntax.shorthands.map(function (node) {
                return node.getText();
            }),
            [ 'value' ]
        );
    });

    test('keeps descendant queries bounded across repeated refinement passes', function () {
        const source = createProject().createSourceFile('input.ts', 'function read(){return compute("x");}');
        const observed = observeSyntaxQueries(source);
        const observations = Array.from({ length: 64 }, function () {
            return readBindingSyntax(observed.node);
        });
        assert.ok(observations.every(function (syntax) {
            return syntax.calls.length === 1;
        }));
        assert.strictEqual(observed.queryCount(), 3);
    });

    test('reads changed syntax after an edit', function () {
        const source = createProject().createSourceFile('input.ts', 'first();');
        const observed = observeSyntaxQueries(source);
        assert.deepStrictEqual(
            readBindingSyntax(observed.node).calls.map(function (node) {
                return node.getText();
            }),
            [ 'first()' ]
        );
        source.replaceWithText('second(); third();');
        assert.deepStrictEqual(
            readBindingSyntax(observed.node).calls.map(function (node) {
                return node.getText();
            }),
            [ 'second()', 'third()' ]
        );
        assert.strictEqual(observed.queryCount(), 6);
    });
});
