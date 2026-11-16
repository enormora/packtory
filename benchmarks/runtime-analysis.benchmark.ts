import assert from 'node:assert/strict';
import path from 'node:path';
import { Project, SyntaxKind } from 'ts-morph';
import { bindingReferenceTargets } from '../source/dead-code-eliminator/reference-target.ts';
import { prepareInitialRuntimeSource } from '../source/dead-code-eliminator/transform/runtime-source-preparation.ts';
import { createSourcePreparation } from '../source/source-transformation/source-preparation.ts';
import {
    namespaceDemandLimits,
    namespaceSyntaxBudgetSize
} from '../source/dead-code-eliminator/exports/namespace-demand-solver.ts';
import {
    bundle,
    createContext,
    resource,
    sourceTreeResources,
    verify,
    withPackageManifest
} from '../source/test-libraries/published-artifact-smoke-gate-fixtures.ts';
import { measurePreparedAsynchronousTask } from './tinybench-measurement.ts';

const maximumMilliseconds = 250;

const functionCount = 64;
const preparationCount = 64;
const maximumFixedPointApplications = 3;
const dependencySourceFileCount = 64;
const maximumDependencyReadabilityChecks = 2;

export async function runPublishedDependencyBenchmark(
    thresholdMultiplier: number,
    writeLine: (message: string) => void
): Promise<void> {
    const name = 'published-dependencies/repository-lookup';
    const measurement = await measurePreparedAsynchronousTask(name, async function () {
        const target = withPackageManifest(
            bundle({ contents: [ resource('index.js'), ...sourceTreeResources(dependencySourceFileCount) ] }),
            {
                dependencies: { external: '^1.0.0' }
            }
        );
        const context = createContext({});
        return async function () {
            await verify(context.gate, target);
            assert.strictEqual(
                context.checkReadability.callCount,
                maximumDependencyReadabilityChecks,
                'Source files must not multiply dependency lookups'
            );
            assert.deepStrictEqual(context.linkDirectory.firstCall.args, [
                path.join('/repo', 'node_modules', 'external'),
                path.join('/repo', 'target/packtory-smoke/node_modules/external'),
                'dir'
            ]);
        };
    });
    writeLine(
        `- ${name}: median ${
            measurement
                .medianMilliseconds
                .toFixed(1)
        }ms, readability checks 2, samples ${measurement.sampleCount}`
    );
    assert.ok(
        measurement.medianMilliseconds <= maximumMilliseconds * thresholdMultiplier,
        `${name} exceeded ${maximumMilliseconds}ms`
    );
}

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
                prepareInitialRuntimeSource(observed);
            }
            assert.ok(applications > 0 && applications <= maximumFixedPointApplications);
            assert.strictEqual(source.getFullText(), content);
            source.replaceWithText('export const answer = 20 + 22;');
            prepareInitialRuntimeSource(preparation);
            assert.match(source.getFullText(), /answer = \(42\)/u);
        };
    });
    writeLine(`- ${name}: median ${measurement.medianMilliseconds.toFixed(1)}ms, samples ${measurement.sampleCount}`);
    assert.ok(
        measurement.medianMilliseconds <= maximumMilliseconds * thresholdMultiplier,
        `${name} exceeded ${maximumMilliseconds}ms`
    );
}
