import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { referenceTarget } from '../reference-target.ts';
import { namespaceBindingDemand } from './namespace-binding-demand.ts';
import { allNamespaceProperties, namespaceMemberDemand, noNamespaceProperties } from './namespace-demand.ts';

suite('namespace binding reference forms', function () {
    for (const referenceKind of [ 'missing', 'foreign', 'string', 'default declaration', 'numeric default' ]) {
        test(`rejects an unproven ${referenceKind} reference`, function () {
            const project = createProject();
            const source = project.createSourceFile('input.ts', 'const ns={};"unrelated";export default class{}');
            const foreign = project.createSourceFile('foreign.ts', 'const other=1;');
            const numeric = project.createSourceFile('numeric.ts', 'export default 42;');
            const references = new Map([
                [ 'missing', undefined ],
                [ 'foreign', foreign.getVariableDeclarationOrThrow('other').getNameNode() ],
                [ 'string', source.getFirstDescendantByKindOrThrow(SyntaxKind.StringLiteral) ],
                [ 'default declaration', source.getFirstDescendantByKindOrThrow(SyntaxKind.DefaultKeyword) ],
                [ 'numeric default', numeric.getFirstDescendantByKindOrThrow(SyntaxKind.NumericLiteral) ]
            ]);
            const demand = namespaceBindingDemand(source.getVariableDeclarationOrThrow('ns'), {
                analyzedFiles: new Set([ source, numeric ]),
                references() {
                    return [ references.get(referenceKind) ];
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
                expression() {
                    assert.fail('unproven references cannot transfer demand');
                }
            });
            assert.strictEqual(demand, allNamespaceProperties);
        });
    }

    test('transfers declaration names and initializer reads through distinct contexts', function () {
        const source = createProject().createSourceFile('input.ts', 'const ns={};const alias=ns;');
        const declaration = source.getVariableDeclarationOrThrow('ns');
        const initializer = source.getVariableDeclarationOrThrow('alias').getInitializerOrThrow();
        const demand = namespaceBindingDemand(declaration, {
            analyzedFiles: new Set([ source ]),
            references() {
                return [ declaration.getNameNode(), initializer ];
            },
            isObserved() {
                return true;
            },
            binding(binding) {
                assert.strictEqual(binding, declaration);
                return noNamespaceProperties;
            },
            expression(reference) {
                assert.strictEqual(reference, initializer);
                return namespaceMemberDemand('used', noNamespaceProperties);
            },
            exported() {
                assert.fail('local aliases do not introduce export demand');
            }
        });
        assert.deepStrictEqual(demand, namespaceMemberDemand('used', noNamespaceProperties));
    });

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
        let exportReads = 0;
        let expressionReads = 0;
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
                expressionReads += 1;
                return noNamespaceProperties;
            },
            exported(exportedSource, name) {
                exportReads += 1;
                assert.strictEqual(exportedSource, source);
                assert.strictEqual(name, 'default');
                return namespaceMemberDemand('used', allNamespaceProperties);
            }
        });
        assert.deepStrictEqual(demand, new Map([ [ 'used', allNamespaceProperties ] ]));
        assert.strictEqual(exportReads, 1);
        assert.strictEqual(expressionReads, 1);
    });
});
