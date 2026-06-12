/* eslint-disable import/max-dependencies -- orchestrator integration tests cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Maybe, Result } from 'true-myth';
import type { ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import type { ValidConfigResult } from '../config/validation.ts';
import { createIteratingScheduler } from '../test-libraries/iterating-scheduler.ts';
import { stubPackageProcessor, stubProgressBroadcaster } from '../test-libraries/orchestrator-stub-fixtures.ts';
import { versionedBundleWithManifest } from '../test-libraries/bundle-fixtures.ts';
import type { BuildAndPublishResult } from './package-processor.ts';
import {
    createDiffAgainstLatestPublishedValidated,
    type ReleaseDiffOrchestratorDependencies
} from './packtory-release-diff.ts';
import type { ReleaseDiffAllResult } from './packtory-results.ts';
import type { ResolvedPackage } from './resolved-package.ts';
import type { PartialError, Scheduler as PackageScheduler } from './scheduler.ts';

const artifactsBuilder = { collectContents: () => [] } as unknown as Pick<ArtifactsBuilder, 'collectContents'>;

function configFor(packageNames: readonly string[]): ValidConfigResult {
    return {
        packageConfigs: Object.fromEntries(
            packageNames.map((name) => {
                return [
                    name,
                    {
                        name,
                        roots: { main: { js: `${name}.js` } },
                        sourcesFolder: 'source',
                        mainPackageJson: { type: 'module' },
                        publishSettings: { access: 'public' },
                        registrySettings: { auth: { type: 'bearer-token', token: 'token' } }
                    }
                ];
            })
        ),
        packtoryConfig: {
            packages: packageNames.map((name) => {
                return { name };
            })
        }
    } as unknown as ValidConfigResult;
}

const okResolve = async () => {
    return Result.ok([] as readonly ResolvedPackage[]);
};

function createDiff(
    scheduler: PackageScheduler,
    packageProcessor: ReleaseDiffOrchestratorDependencies['packageProcessor'] = stubPackageProcessor
): ReturnType<typeof createDiffAgainstLatestPublishedValidated> {
    const dependencies: ReleaseDiffOrchestratorDependencies = {
        artifactsBuilder,
        packageProcessor,
        progressBroadcaster: stubProgressBroadcaster,
        scheduler
    };
    return createDiffAgainstLatestPublishedValidated(dependencies);
}

function staged<TFirst, TSecond>(
    firstReturn: () => Result<TFirst, PartialError<unknown>>,
    secondReturn: () => Result<TSecond, PartialError<unknown>>
): PackageScheduler {
    let invocations = 0;
    return {
        async runForEachScheduledPackage() {
            invocations += 1;
            if (invocations === 1) {
                return firstReturn();
            }
            return secondReturn();
        }
    } as unknown as PackageScheduler;
}

function publishThenRunStage(succeededPublish: readonly BuildAndPublishResult[]): PackageScheduler {
    let invocations = 0;
    return {
        async runForEachScheduledPackage(params: {
            readonly config: { readonly packtoryConfig: { readonly packages: readonly { readonly name: string }[] } };
            readonly createOptions: (context: {
                readonly packageName: string;
                readonly existing: readonly unknown[];
                readonly config: unknown;
            }) => unknown;
            readonly execute: (options: unknown) => Promise<unknown>;
        }) {
            invocations += 1;
            if (invocations === 1) {
                return Result.ok(succeededPublish);
            }
            const stageResults: unknown[] = [];
            for (const pkg of params.config.packtoryConfig.packages) {
                const options = params.createOptions({
                    packageName: pkg.name,
                    existing: [],
                    config: params.config
                });
                const result = await params.execute(options);
                if (result !== undefined) {
                    stageResults.push(result);
                }
            }
            return Result.ok(stageResults);
        }
    } as unknown as PackageScheduler;
}

async function assertDerivedTransition(spec: {
    readonly buildResult: BuildAndPublishResult;
    readonly expectedState: 'changed' | 'first-publish' | 'unchanged';
    readonly expectedVersionTransition: string;
    readonly expectedPreviousVersionLabel: string;
}): Promise<void> {
    const diff = createDiff(publishThenRunStage([spec.buildResult]));

    const result = await diff(configFor(['pkg-a']), okResolve);

    if (result.isErr) {
        assert.fail(`expected Ok, got ${result.error.type}`);
    }
    const [entry] = result.value;
    assert.ok(entry);
    assert.strictEqual(entry.state, spec.expectedState);
    assert.strictEqual(entry.versionTransition, spec.expectedVersionTransition);
    assert.strictEqual(entry.previousVersionLabel, spec.expectedPreviousVersionLabel);
}

function expectPartialErr(result: ReleaseDiffAllResult): PartialError<unknown> & { readonly type: 'partial' } {
    if (result.isOk) {
        assert.fail('expected Err');
    }
    if (result.error.type !== 'partial') {
        assert.fail(`expected partial, got ${result.error.type}`);
    }
    return result.error;
}

suite('packtory-release-diff', function () {
    test('runs dry-run publish preparation with staged publishing disabled', async function () {
        let sawDryRunStageFlag = false;
        const diff = createDiff(createIteratingScheduler(['pkg-a']), {
            ...stubPackageProcessor,
            async tryBuildAndPublish(options) {
                sawDryRunStageFlag = true;
                assert.strictEqual(options.stage, false);
                return {
                    status: 'already-published',
                    bundle: versionedBundleWithManifest({
                        name: 'pkg-a',
                        version: '1.0.0',
                        packageJson: { name: 'pkg-a', version: '1.0.0' }
                    }),
                    extraFiles: [],
                    previousReleaseArtifacts: Maybe.nothing()
                } as unknown as BuildAndPublishResult;
            }
        });

        const result = await diff(configFor(['pkg-a']), async () => {
            return Result.ok([
                {
                    name: 'pkg-a',
                    analyzedBundle: {
                        name: 'pkg-a',
                        contents: [],
                        roots: {},
                        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
                    },
                    resolveOptions: {}
                }
            ] as unknown as readonly ResolvedPackage[]);
        });

        assert.strictEqual(result.isOk, true);
        assert.strictEqual(sawDryRunStageFlag, true);
    });

    test('returns a config Err when resolve-and-link returns a non-partial failure (unchanged passthrough)', async function () {
        const diff = createDiff(createIteratingScheduler([]));

        const result = await diff(configFor([]), async () => {
            return Result.err({ type: 'config', issues: ['bad'] });
        });

        if (result.isOk) {
            assert.fail('expected Err');
        }
        assert.strictEqual(result.error.type, 'config');
    });

    test('returns a partial Err with empty succeeded and the resolve-stage failures when resolve-and-link returns a partial failure', async function () {
        const diff = createDiff(createIteratingScheduler([]));
        const resolveFailures = [new Error('resolve a'), new Error('resolve b')];

        const result = await diff(configFor([]), async () => {
            return Result.err({ type: 'partial', error: { succeeded: [], failures: resolveFailures } });
        });

        const partial = expectPartialErr(result);
        assert.deepStrictEqual(partial.succeeded, []);
        assert.deepStrictEqual(partial.failures, resolveFailures);
    });

    test('returns Ok with an empty diff array when resolve, publish-stage, and release-diff-stage all succeed with no packages', async function () {
        const diff = createDiff(createIteratingScheduler([]));

        const result = await diff(configFor([]), okResolve);

        if (result.isErr) {
            assert.fail('expected Ok');
        }
        assert.deepStrictEqual(result.value, []);
    });

    test('returns a partial Err carrying the publish-stage failures when publish-stage returns Err', async function () {
        const publishError = new Error('publish failed');
        const diff = createDiff(
            staged(
                () => {
                    return Result.err({ succeeded: [], failures: [publishError] });
                },
                () => {
                    return Result.ok([]);
                }
            )
        );

        const partial = expectPartialErr(await diff(configFor(['pkg-a']), okResolve));
        assert.deepStrictEqual(partial.failures, [publishError]);
        assert.deepStrictEqual(partial.succeeded, []);
    });

    test('returns a partial Err combining publish-stage failures with the release-diff stage succeeded entries when both stages fail', async function () {
        const publishError = new Error('publish failed');
        const stageError = new Error('stage failed');
        const partialStageSuccess = {
            name: 'pkg-stage-survivor',
            state: 'changed' as const,
            versionTransition: '1.0.0 -> 1.0.1',
            previousVersionLabel: '1.0.0',
            files: { added: [], removed: [], modified: [], unchanged: [] }
        };
        const diff = createDiff(
            staged(
                () => {
                    return Result.err({ succeeded: [], failures: [publishError] });
                },
                () => {
                    return Result.err({ succeeded: [partialStageSuccess], failures: [stageError] });
                }
            )
        );

        const partial = expectPartialErr(await diff(configFor(['pkg-a']), okResolve));
        assert.deepStrictEqual(partial.failures, [publishError]);
        assert.deepStrictEqual(partial.succeeded, [partialStageSuccess]);
    });

    test('returns a partial Err carrying the release-diff stage failures when only the stage returns Err', async function () {
        const stageError = new Error('stage failed');
        const diff = createDiff(
            staged(
                () => {
                    return Result.ok([]);
                },
                () => {
                    return Result.err({ succeeded: [], failures: [stageError] });
                }
            )
        );

        const partial = expectPartialErr(await diff(configFor(['pkg-a']), okResolve));
        assert.deepStrictEqual(partial.failures, [stageError]);
    });

    test('derives a first-publish entry with versionTransition "(unpublished) -> X.Y.Z" from the build result when previousReleaseArtifacts is Nothing', async function () {
        await assertDerivedTransition({
            buildResult: {
                status: 'initial-version',
                bundle: { name: 'pkg-a', version: '1.0.0' },
                extraFiles: [],
                previousReleaseArtifacts: Maybe.nothing()
            } as unknown as BuildAndPublishResult,
            expectedState: 'first-publish',
            expectedVersionTransition: '(unpublished) -> 1.0.0',
            expectedPreviousVersionLabel: '(unpublished)'
        });
    });

    test('derives a changed entry with versionTransition "PREV -> NEW" from the build result when previousReleaseArtifacts carries a previous version', async function () {
        await assertDerivedTransition({
            buildResult: {
                status: 'new-version',
                bundle: { name: 'pkg-a', version: '1.0.1' },
                extraFiles: [],
                previousReleaseArtifacts: Maybe.just({ version: '1.0.0', gitHead: undefined, files: [] })
            } as unknown as BuildAndPublishResult,
            expectedState: 'changed',
            expectedVersionTransition: '1.0.0 -> 1.0.1',
            expectedPreviousVersionLabel: '1.0.0'
        });
    });
});
