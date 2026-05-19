/* eslint-disable @typescript-eslint/consistent-type-assertions, import/max-dependencies -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe, Result } from 'true-myth';
import type { ArtifactsBuilder } from '../../artifacts/artifacts-builder.ts';
import type { ValidConfigResult } from '../../config/validation.ts';
import type { FileDescription } from '../../file-manager/file-description.ts';
import { createIteratingScheduler, type IteratingSchedulerCapture } from '../../test-libraries/iterating-scheduler.ts';
import type { BuildAndPublishResult } from '../package-processor.ts';
import type { Scheduler as PackageScheduler } from '../scheduler.ts';
import { runReleaseDiffStage } from './release-diff-stage.ts';

function configFor(packageNames: readonly string[]): ValidConfigResult {
    return {
        packtoryConfig: {
            packages: packageNames.map((name) => {
                return { name };
            })
        }
    } as unknown as ValidConfigResult;
}

function buildResultFor(name: string, overrides: Partial<BuildAndPublishResult> = {}): BuildAndPublishResult {
    return {
        status: 'new-version',
        bundle: {
            name,
            version: '1.0.0',
            manifestFile: { filePath: 'package.json', content: `{"name":"${name}","version":"1.0.0"}\n` }
        } as never,
        extraFiles: [],
        previousReleaseArtifacts: Maybe.nothing(),
        ...overrides
    };
}

function artifactsBuilderReturning(files: readonly FileDescription[]): { collectContents: SinonSpy } {
    return { collectContents: fake.returns(files) };
}

async function runPkgAStage(
    files: readonly FileDescription[],
    buildResultOverrides: Partial<BuildAndPublishResult> = {}
): ReturnType<typeof runReleaseDiffStage> {
    return runReleaseDiffStage(
        {
            artifactsBuilder: artifactsBuilderReturning(files) as unknown as ArtifactsBuilder,
            scheduler: createIteratingScheduler(['pkg-a'])
        },
        configFor(['pkg-a']),
        [buildResultFor('pkg-a', buildResultOverrides)]
    );
}

async function runAlreadyPublishedPkgAStage(artifactsBuilder: {
    collectContents: SinonSpy;
}): ReturnType<typeof runReleaseDiffStage> {
    return runReleaseDiffStage(
        {
            artifactsBuilder: artifactsBuilder as unknown as ArtifactsBuilder,
            scheduler: createIteratingScheduler(['pkg-a'])
        },
        configFor(['pkg-a']),
        [
            buildResultFor('pkg-a', {
                status: 'already-published',
                previousReleaseArtifacts: Maybe.just({ version: '1.0.0', files: [] })
            })
        ]
    );
}

suite('release-diff-stage', function () {
    test('skips packages whose BuildAndPublishResult is missing (publish-stage failed earlier)', async function () {
        const result = await runReleaseDiffStage(
            {
                artifactsBuilder: artifactsBuilderReturning([]) as unknown as ArtifactsBuilder,
                scheduler: createIteratingScheduler(['pkg-a', 'pkg-broken'])
            },
            configFor(['pkg-a', 'pkg-broken']),
            [buildResultFor('pkg-a')]
        );

        if (result.isErr) {
            assert.fail('expected ok result');
        }
        const names = result.value.map((entry) => {
            return entry.name;
        });
        assert.deepStrictEqual(names, ['pkg-a']);
    });

    test('produces an unchanged entry with all four file buckets empty when the BuildAndPublishResult is already-published', async function () {
        const result = await runAlreadyPublishedPkgAStage(artifactsBuilderReturning([]));

        if (result.isErr) {
            assert.fail('expected ok result');
        }
        const [first] = result.value;
        assert.ok(first);
        assert.strictEqual(first.state, 'unchanged');
        assert.strictEqual(first.previousVersionLabel, '1.0.0');
        assert.deepStrictEqual(first.files, { added: [], removed: [], modified: [], unchanged: [] });
    });

    test('produces a first-publish state with all bundled files in `added`, empty `removed`/`modified`/`unchanged`', async function () {
        const result = await runPkgAStage([
            { filePath: 'package.json', content: '{}', isExecutable: false },
            { filePath: 'bin/cli.js', content: '#!/usr/bin/env node\n', isExecutable: true }
        ]);

        if (result.isErr) {
            assert.fail('expected ok result');
        }
        const [first] = result.value;
        assert.ok(first);
        assert.strictEqual(first.state, 'first-publish');
        assert.deepStrictEqual(first.files.added, [
            { path: 'package.json', sizeBytes: 2, isExecutable: false },
            { path: 'bin/cli.js', sizeBytes: 20, isExecutable: true }
        ]);
        assert.deepStrictEqual(first.files.removed, []);
        assert.deepStrictEqual(first.files.modified, []);
        assert.deepStrictEqual(first.files.unchanged, []);
        assert.strictEqual(first.versionTransition, '(unpublished) -> 1.0.0');
    });

    test('measures added-file sizes in UTF-8 bytes', async function () {
        const result = await runPkgAStage([{ filePath: 'r.md', content: 'á', isExecutable: false }]);

        if (result.isErr) {
            assert.fail('expected ok result');
        }
        const [first] = result.value;
        assert.ok(first);
        const [added] = first.files.added;
        assert.ok(added);
        assert.strictEqual(added.sizeBytes, Buffer.byteLength('á', 'utf8'));
    });

    test('passes the bundle, the "package" target tag, and the extraFiles to artifactsBuilder.collectContents', async function () {
        const collectContents = fake.returns([]);
        const extraFile: FileDescription = { filePath: 'sbom.cdx.json', content: '{}', isExecutable: false };
        const bundle = {
            name: 'pkg-a',
            version: '1.0.0'
        } as never;

        await runReleaseDiffStage(
            {
                artifactsBuilder: { collectContents } as unknown as ArtifactsBuilder,
                scheduler: createIteratingScheduler(['pkg-a'])
            },
            configFor(['pkg-a']),
            [
                {
                    status: 'new-version',
                    bundle,
                    extraFiles: [extraFile],
                    previousReleaseArtifacts: Maybe.nothing()
                } as BuildAndPublishResult
            ]
        );

        assert.strictEqual(collectContents.callCount, 1);
        assert.deepStrictEqual(collectContents.firstCall.args, [bundle, 'package', [extraFile]]);
    });

    test('does not call artifactsBuilder.collectContents for an already-published package', async function () {
        const collectContents = fake.returns([]);
        await runAlreadyPublishedPkgAStage({ collectContents });
        assert.strictEqual(collectContents.callCount, 0);
    });

    test('forwards a scheduler partial failure as a release-diff partial failure with diff successes', async function () {
        const failingError = new Error('something exploded');
        const failingScheduler = {
            async runForEachScheduledPackage() {
                return Result.err({
                    succeeded: [undefined],
                    failures: [failingError]
                });
            }
        } as unknown as PackageScheduler;

        const result = await runReleaseDiffStage(
            {
                artifactsBuilder: artifactsBuilderReturning([]) as unknown as ArtifactsBuilder,
                scheduler: failingScheduler
            },
            configFor(['pkg-a']),
            [buildResultFor('pkg-a')]
        );

        if (result.isOk) {
            assert.fail('expected Err');
        }
        assert.deepStrictEqual(result.error.failures, [failingError]);
        assert.deepStrictEqual(result.error.succeeded, []);
    });

    test('passes emitScheduledEvents=false to the scheduler so it does not re-emit `scheduled` events the publish-stage already emitted', async function () {
        const capture: IteratingSchedulerCapture = { events: [], selected: [] };
        await runReleaseDiffStage(
            {
                artifactsBuilder: artifactsBuilderReturning([]) as unknown as ArtifactsBuilder,
                scheduler: createIteratingScheduler(['pkg-a'], capture)
            },
            configFor(['pkg-a']),
            [buildResultFor('pkg-a')]
        );
        assert.strictEqual(capture.emitScheduledEvents, false);
    });

    test("selectNext yields each package's name so the scheduler can thread package identity into later generations", async function () {
        const capture: IteratingSchedulerCapture = { events: [], selected: [] };
        await runReleaseDiffStage(
            {
                artifactsBuilder: artifactsBuilderReturning([]) as unknown as ArtifactsBuilder,
                scheduler: createIteratingScheduler(['pkg-a', 'pkg-b'], capture)
            },
            configFor(['pkg-a', 'pkg-b']),
            [buildResultFor('pkg-a'), buildResultFor('pkg-b')]
        );
        assert.deepStrictEqual(capture.selected, ['pkg-a', 'pkg-b']);
    });

    test('produces a changed state with a file-set diff when there is a previous release', async function () {
        const newFiles: readonly FileDescription[] = [
            { filePath: 'package.json', content: '{"version":"1.0.1"}\n', isExecutable: false },
            { filePath: 'lib/index.js', content: 'export const x = 2;\n', isExecutable: false }
        ];
        const previousFiles: readonly FileDescription[] = [
            { filePath: 'package.json', content: '{"version":"1.0.0"}\n', isExecutable: false },
            { filePath: 'lib/index.js', content: 'export const x = 1;\n', isExecutable: false },
            { filePath: 'lib/legacy.js', content: '// gone\n', isExecutable: false }
        ];

        const result = await runReleaseDiffStage(
            {
                artifactsBuilder: artifactsBuilderReturning(newFiles) as unknown as ArtifactsBuilder,
                scheduler: createIteratingScheduler(['pkg-a'])
            },
            configFor(['pkg-a']),
            [
                buildResultFor('pkg-a', {
                    bundle: {
                        name: 'pkg-a',
                        version: '1.0.1',
                        manifestFile: { filePath: 'package.json', content: '{"name":"pkg-a","version":"1.0.1"}\n' }
                    } as never,
                    previousReleaseArtifacts: Maybe.just({ version: '1.0.0', files: previousFiles })
                })
            ]
        );

        if (result.isErr) {
            assert.fail('expected ok result');
        }
        const entry = result.value[0];
        assert.ok(entry);
        assert.strictEqual(entry.state, 'changed');
        assert.strictEqual(entry.files.modified.length, 2);
        assert.strictEqual(entry.files.removed.length, 1);
        assert.strictEqual(entry.files.added.length, 0);
        assert.strictEqual(entry.versionTransition, '1.0.0 -> 1.0.1');
    });
});
