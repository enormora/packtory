import assert from 'node:assert/strict';
import { Project, SyntaxKind } from 'ts-morph';
import {
    readBindingSyntax,
    type BindingSyntaxNode
} from '../source/dead-code-eliminator/reachability/binding-syntax.ts';
import { bindingReferenceTargets } from '../source/dead-code-eliminator/reference-target.ts';
import { prepareLocalRuntimeSource } from '../source/dead-code-eliminator/transform/local-source-preparation.ts';
import { createSourcePreparation } from '../source/source-transformation/source-preparation.ts';
import {
    namespaceDemandLimits,
    namespaceSyntaxBudgetSize
} from '../source/dead-code-eliminator/exports/namespace-demand-solver.ts';
import { createTypeAncestorAnalysis, hasTypeAncestor } from '../source/source-transformation/type-ancestors.ts';
import { measurePreparedAsynchronousTask } from './tinybench-measurement.ts';

const maximumMilliseconds = 250;

const functionCount = 64;
const preparationCount = 64;
const maximumFixedPointApplications = 3;

export async function runBindingReferenceBenchmark(
    thresholdMultiplier: number,
    writeLine: (message: string) => void
): Promise<void> {
    const name = 'binding-references/unchanged-program';
    const measurement = await measurePreparedAsynchronousTask(name, async function () {
        const project = new Project({
            useInMemoryFileSystem: true,
            skipLoadingLibFiles: true,
            compilerOptions: { allowJs: true, noLib: true }
        });
        const names = Array.from({ length: 16 }, function (_value, index) {
            return `value${index}`;
        });
        const declarations = names.map(function (binding) {
            return `export const ${binding}=1;`;
        });
        const source = project.createSourceFile(
            '/source/index.js',
            [
                ...declarations,
                `export function read(){return [${names.join(',')}];}`
            ]
                .join('\n')
        );
        const bindings = source.getVariableDeclarations().map(function (declaration) {
            return declaration.getNameNode().asKindOrThrow(SyntaxKind.Identifier);
        });
        return async function () {
            for (let iteration = 0; iteration < preparationCount; iteration += 1) {
                for (const binding of bindings) {
                    assert.deepStrictEqual(
                        bindingReferenceTargets(binding).map(function (reference) {
                            return reference.getText();
                        }),
                        [ binding.getText(), binding.getText() ]
                    );
                }
            }
        };
    });
    writeLine(`- ${name}: median ${measurement.medianMilliseconds.toFixed(1)}ms, samples ${measurement.sampleCount}`);
    assert.ok(
        measurement.medianMilliseconds <= maximumMilliseconds * thresholdMultiplier,
        `${name} exceeded ${maximumMilliseconds}ms`
    );
}

export async function runNamespaceSizingBenchmark(
    thresholdMultiplier: number,
    writeLine: (message: string) => void
): Promise<void> {
    const name = 'namespace-analysis/saturated-syntax-budget';
    const maximumLimits = namespaceDemandLimits([ Number.MAX_SAFE_INTEGER ]);
    const measurement = await measurePreparedAsynchronousTask(name, async function () {
        const project = new Project({
            useInMemoryFileSystem: true,
            skipLoadingLibFiles: true,
            compilerOptions: { allowJs: true, noLib: true }
        });
        const source = project.createSourceFile(
            '/source/index.js',
            Array
                .from({ length: functionCount }, function (_value, index) {
                    return `export const value${index}=${index};`;
                })
                .join('\n')
        );
        const remainingSource = new Proxy(source, {
            get() {
                return assert.fail('A saturated budget must not inspect remaining sources');
            }
        });
        return async function () {
            assert.deepStrictEqual(
                namespaceDemandLimits([ namespaceSyntaxBudgetSize([ source, remainingSource ]) ]),
                maximumLimits
            );
        };
    });
    writeLine(`- ${name}: median ${measurement.medianMilliseconds.toFixed(1)}ms, samples ${measurement.sampleCount}`);
    assert.ok(
        measurement.medianMilliseconds <= maximumMilliseconds * thresholdMultiplier,
        `${name} exceeded ${maximumMilliseconds}ms`
    );
}

export async function runRuntimePreparationBenchmark(
    thresholdMultiplier: number,
    writeLine: (message: string) => void
): Promise<void> {
    const name = 'runtime-preparation/repeated-fixed-point';
    const measurement = await measurePreparedAsynchronousTask(name, async function () {
        const content = Array
            .from({ length: functionCount }, function (_value, index) {
                return `export function compute${index}(input) { const result = input + 1; return result; }`;
            })
            .join('\n');
        const project = new Project({
            useInMemoryFileSystem: true,
            skipLoadingLibFiles: true,
            compilerOptions: { allowJs: true, noLib: true }
        });
        const source = project.createSourceFile('/source/index.js', content);
        const preparation = createSourcePreparation(source);
        let applications = 0;
        const observed = {
            ...preparation,
            applyEdits(edits: Parameters<typeof preparation.applyEdits>[0]) {
                applications += 1;
                preparation.applyEdits(edits);
            }
        };
        return async function () {
            for (let iteration = 0; iteration < preparationCount; iteration += 1) {
                prepareLocalRuntimeSource(observed);
            }
            assert.ok(applications > 0 && applications <= maximumFixedPointApplications);
            assert.strictEqual(source.getFullText(), content);
            source.replaceWithText('export const answer = 20 + 22;');
            prepareLocalRuntimeSource(preparation);
            assert.match(source.getFullText(), /answer = \(42\)/u);
        };
    });
    writeLine(`- ${name}: median ${measurement.medianMilliseconds.toFixed(1)}ms, samples ${measurement.sampleCount}`);
    assert.ok(
        measurement.medianMilliseconds <= maximumMilliseconds * thresholdMultiplier,
        `${name} exceeded ${maximumMilliseconds}ms`
    );
}

export async function runTypeAncestorBenchmark(
    thresholdMultiplier: number,
    writeLine: (message: string) => void
): Promise<void> {
    const name = 'type-positions/shared-ancestors';
    const depth = 64;
    const referenceCount = 256;
    const maximumParentReads = 400;
    const measurement = await measurePreparedAsynchronousTask(name, async function () {
        const project = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true });
        const source = project.createSourceFile(
            'source.ts',
            `function read(){${'{'.repeat(depth)}return [${
                Array
                    .from({ length: referenceCount }, function () {
                        return 'value';
                    })
                    .join(',')
            }];${'}'.repeat(depth)}} type Value=typeof value;`
        );
        const identifiers = source.getDescendantsOfKind(SyntaxKind.Identifier);
        let parentReads = 0;
        const analyze = createTypeAncestorAnalysis(function (node) {
            parentReads += 1;
            return node.getParent();
        }, new WeakMap());
        return async function () {
            let typeReferences = 0;
            for (let iteration = 0; iteration < preparationCount; iteration += 1) {
                for (const identifier of identifiers) {
                    const result = hasTypeAncestor(identifier);
                    assert.strictEqual(result, analyze(identifier));
                    typeReferences += Number(result);
                }
            }
            assert.strictEqual(typeReferences, preparationCount);
            assert.ok(parentReads <= maximumParentReads, `Shared ancestry required ${parentReads} parent reads`);
        };
    });
    writeLine(
        `- ${name}: median ${
            measurement
                .medianMilliseconds
                .toFixed(1)
        }ms, at most ${maximumParentReads} parent reads, samples ${measurement.sampleCount}`
    );
    assert.ok(
        measurement.medianMilliseconds <= maximumMilliseconds * thresholdMultiplier,
        `${name} exceeded ${maximumMilliseconds}ms`
    );
}

export async function runBindingSyntaxBenchmark(
    thresholdMultiplier: number,
    writeLine: (message: string) => void
): Promise<void> {
    const name = 'binding-syntax/repeated-refinement';
    const queriesPerBinding = 3;
    const maximumQueries = functionCount * queriesPerBinding;
    const measurement = await measurePreparedAsynchronousTask(name, async function () {
        const project = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true });
        const source = project.createSourceFile(
            'source.ts',
            Array
                .from({ length: functionCount }, function (_value, index) {
                    return `function read${index}(){return compute(value);}`;
                })
                .join('\n')
        );
        let queries = 0;
        const bindings = source.getFunctions().map(function (root): BindingSyntaxNode {
            return {
                get compilerNode() {
                    return root.compilerNode;
                },
                getSourceFile() {
                    return source;
                },
                getDescendantsOfKind(kind) {
                    queries += 1;
                    return root.getDescendantsOfKind(kind);
                }
            };
        });
        return async function () {
            for (let refinement = 0; refinement < preparationCount; refinement += 1) {
                for (const binding of bindings) {
                    assert.deepStrictEqual(
                        readBindingSyntax(binding).calls.map(function (call) {
                            return call.getText();
                        }),
                        [ 'compute(value)' ]
                    );
                }
            }
            assert.ok(queries <= maximumQueries, `Repeated refinement required ${queries} descendant queries`);
        };
    });
    writeLine(
        `- ${name}: median ${
            measurement
                .medianMilliseconds
                .toFixed(1)
        }ms, at most ${maximumQueries} descendant queries, samples ${measurement.sampleCount}`
    );
    assert.ok(
        measurement.medianMilliseconds <= maximumMilliseconds * thresholdMultiplier,
        `${name} exceeded ${maximumMilliseconds}ms`
    );
}
