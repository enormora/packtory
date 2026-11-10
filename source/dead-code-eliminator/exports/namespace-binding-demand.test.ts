import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { referenceTarget } from '../reference-target.ts';
import { namespaceBindingDemand } from './namespace-binding-demand.ts';
import { allNamespaceProperties, namespaceMemberDemand, noNamespaceProperties } from './namespace-demand.ts';

suite('namespace binding reference forms', function () {
    test('tracks quoted exports through their real language service references', function () {
        const source = createProject().createSourceFile('input.ts', 'const ns={};export {ns as "public ns"};');
        const declaration = source.getVariableDeclarationOrThrow('ns');
        const demand = namespaceBindingDemand(declaration, {
            analyzedFiles: new Set([ source ]),
            references(name) {
                return name.findReferences().flatMap(function (group) {
                    return group.getReferences().map(referenceTarget);
                });
            },
            isObserved() {
                return true;
            },
            binding() {
                return noNamespaceProperties;
            },
            exported() {
                return noNamespaceProperties;
            },
            expression(reference) {
                assert.strictEqual(reference.getParentOrThrow().getKind(), SyntaxKind.ExportSpecifier);
                return namespaceMemberDemand('used', allNamespaceProperties);
            }
        });
        assert.deepStrictEqual(demand, new Map([ [ 'used', allNamespaceProperties ] ]));
    });

    test('recognizes default export keywords as module export references', function () {
        const source = createProject().createSourceFile('input.ts', 'const ns={};export default ns;');
        const declaration = source.getVariableDeclarationOrThrow('ns');
        const exported = source.getFirstDescendantByKindOrThrow(SyntaxKind.ExportAssignment);
        const demand = namespaceBindingDemand(declaration, {
            analyzedFiles: new Set([ source ]),
            references() {
                return [ exported.getFirstChildByKindOrThrow(SyntaxKind.DefaultKeyword), exported.getExpression() ];
            },
            isObserved() {
                return true;
            },
            binding() {
                return noNamespaceProperties;
            },
            expression() {
                return noNamespaceProperties;
            },
            exported(exportedSource, name) {
                assert.strictEqual(exportedSource, source);
                assert.strictEqual(name, 'default');
                return namespaceMemberDemand('used', allNamespaceProperties);
            }
        });
        assert.deepStrictEqual(demand, new Map([ [ 'used', allNamespaceProperties ] ]));
    });
});
