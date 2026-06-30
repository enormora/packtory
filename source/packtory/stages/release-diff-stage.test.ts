/* eslint-disable @typescript-eslint/consistent-type-assertions, import/max-dependencies -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Maybe, Result } from 'true-myth';
import { noPublication } from '../../bundle-emitter/publication-outcome.ts';
import type { ValidConfigResult } from '../../config/validation.ts';
import type { FileDescription } from '../../file-manager/file-description.ts';
import { createIteratingScheduler, type IteratingSchedulerCapture } from '../../test-libraries/iterating-scheduler.ts';
import { buildSbomFixtureContent } from '../../test-libraries/sbom-fixtures.ts';
import type { BuildAndPublishResult } from '../package-processor.ts';
import type { Scheduler as PackageScheduler } from '../scheduler.ts';
import type { FileSetDiff, PackageReleaseDiff } from '../../report/release-diff/file-set-diff.ts';
import { runReleaseDiffStage, type ReleaseDiffStageResult } from './release-diff-stage.ts';

type ArtifactsBuilderStub = {
    readonly collectContents: SinonSpy;
};

function configFor(packageNames: readonly string[]): ValidConfigResult {
    return {
        packtoryConfig: {
            packages: packageNames.map(function (name) {
                return { name };
            })
        }
    } as unknown as ValidConfigResult;
}

function buildResultFor(name: string, overrides: Partial<BuildAndPublishResult> = {}): BuildAndPublishResult {
    return {
        status: 'new-version',
        publication: noPublication,
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

function artifactsBuilderReturning(files: readonly FileDescription[]): ArtifactsBuilderStub {
    return { collectContents: fake.returns(files) };
}

async function runPkgAStage(
    files: readonly FileDescription[],
    buildResultOverrides: Partial<BuildAndPublishResult> = {}
): ReturnType<typeof runReleaseDiffStage> {
    return runReleaseDiffStage(
        {
            artifactsBuilder: artifactsBuilderReturning(files),
            scheduler: createIteratingScheduler([ 'pkg-a' ])
        },
        configFor([ 'pkg-a' ]),
        [ buildResultFor('pkg-a', buildResultOverrides) ]
    );
}

function expectOk(result: ReleaseDiffStageResult): readonly PackageReleaseDiff[] {
    if (result.isErr) {
        assert.fail('expected ok result');
    }
    return result.value;
}

function expectFirstEntry(result: ReleaseDiffStageResult): PackageReleaseDiff {
    const [ first ] = expectOk(result);
    if (first === undefined) {
        assert.fail('expected first result');
    }
    return first;
}

async function runSbomDiff(previousSbom: string, currentSbom: string): Promise<FileSetDiff> {
    const newFiles: readonly FileDescription[] = [
        { filePath: 'sbom.cdx.json', content: currentSbom, isExecutable: false }
    ];
    const previousFiles: readonly FileDescription[] = [
        { filePath: 'sbom.cdx.json', content: previousSbom, isExecutable: false }
    ];
    const result = await runReleaseDiffStage(
        {
            artifactsBuilder: artifactsBuilderReturning(newFiles),
            scheduler: createIteratingScheduler([ 'pkg-a' ])
        },
        configFor([ 'pkg-a' ]),
        [
            buildResultFor('pkg-a', {
                previousReleaseArtifacts: Maybe.just({ version: '1.0.0', gitHead: undefined, files: previousFiles })
            })
        ]
    );
    if (result.isErr) {
        assert.fail('expected ok result');
    }
    const entry = expectFirstEntry(result);
    return entry.files;
}

async function runAlreadyPublishedPkgAStage(
    artifactsBuilder: ArtifactsBuilderStub
): ReturnType<typeof runReleaseDiffStage> {
    return runReleaseDiffStage(
        {
            artifactsBuilder,
            scheduler: createIteratingScheduler([ 'pkg-a' ])
        },
        configFor([ 'pkg-a' ]),
        [
            buildResultFor('pkg-a', {
                status: 'already-published',
                previousReleaseArtifacts: Maybe.just({ version: '1.0.0', gitHead: undefined, files: [] })
            })
        ]
    );
}

function registerBasicDiffTests(): void {
    test('skips packages whose BuildAndPublishResult is missing (publish-stage failed earlier)', async function () {
        const result = await runReleaseDiffStage(
            {
                artifactsBuilder: artifactsBuilderReturning([]),
                scheduler: createIteratingScheduler([ 'pkg-a', 'pkg-broken' ])
            },
            configFor([ 'pkg-a', 'pkg-broken' ]),
            [ buildResultFor('pkg-a') ]
        );

        const names = expectOk(result).map(function (entry) {
            return entry.name;
        });
        assert.deepStrictEqual(names, [ 'pkg-a' ]);
    });

    test('produces an unchanged entry with all four file buckets empty when the BuildAndPublishResult is already-published', async function () {
        const result = await runAlreadyPublishedPkgAStage(artifactsBuilderReturning([]));

        const first = expectFirstEntry(result);
        assert.strictEqual(first.state, 'unchanged');
        assert.strictEqual(first.previousVersionLabel, '1.0.0');
        assert.deepStrictEqual(first.files, { added: [], removed: [], modified: [], unchanged: [] });
    });

    test('produces a first-publish state with all bundled files in `added`, empty `removed`/`modified`/`unchanged`', async function () {
        const result = await runPkgAStage([
            { filePath: 'package.json', content: '{}', isExecutable: false },
            { filePath: 'bin/cli.js', content: '#!/usr/bin/env node\n', isExecutable: true }
        ]);

        const first = expectFirstEntry(result);
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
        const result = await runPkgAStage([ { filePath: 'r.md', content: 'á', isExecutable: false } ]);

        const first = expectFirstEntry(result);
        const [ added ] = first.files.added;
        if (added === undefined) {
            assert.fail('expected added file');
        }
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
                artifactsBuilder: { collectContents },
                scheduler: createIteratingScheduler([ 'pkg-a' ])
            },
            configFor([ 'pkg-a' ]),
            [
                {
                    status: 'new-version',
                    publication: noPublication,
                    bundle,
                    extraFiles: [ extraFile ],
                    previousReleaseArtifacts: Maybe.nothing()
                }
            ]
        );

        assert.strictEqual(collectContents.callCount, 1);
        assert.deepStrictEqual(collectContents.firstCall.args, [ bundle, 'package', [ extraFile ] ]);
    });

    test('does not call artifactsBuilder.collectContents for an already-published package', async function () {
        const collectContents = fake.returns([]);
        await runAlreadyPublishedPkgAStage({ collectContents });
        assert.strictEqual(collectContents.callCount, 0);
    });
}

function registerSchedulerTests(): void {
    test('forwards a scheduler partial failure as a release-diff partial failure with diff successes', async function () {
        const failingError = new Error('something exploded');
        const failingScheduler = {
            async runForEachScheduledPackage() {
                return Result.err({
                    succeeded: [ undefined ],
                    failures: [ failingError ]
                });
            }
        } as unknown as PackageScheduler;

        const result = await runReleaseDiffStage(
            {
                artifactsBuilder: artifactsBuilderReturning([]),
                scheduler: failingScheduler
            },
            configFor([ 'pkg-a' ]),
            [ buildResultFor('pkg-a') ]
        );

        if (result.isOk) {
            assert.fail('expected Err');
        }
        assert.deepStrictEqual(result.error.failures, [ failingError ]);
        assert.deepStrictEqual(result.error.succeeded, []);
    });

    test('passes emitScheduledEvents=false to the scheduler so it does not re-emit `scheduled` events the publish-stage already emitted', async function () {
        const events: unknown[] = [];
        const selected: unknown[] = [];
        const capture: IteratingSchedulerCapture = { events, selected };
        await runReleaseDiffStage(
            {
                artifactsBuilder: artifactsBuilderReturning([]),
                scheduler: createIteratingScheduler([ 'pkg-a' ], capture)
            },
            configFor([ 'pkg-a' ]),
            [ buildResultFor('pkg-a') ]
        );
        assert.strictEqual(capture.emitScheduledEvents, false);
    });

    test("selectNext yields each package's name so the scheduler can thread package identity into later generations", async function () {
        const events: unknown[] = [];
        const selected: unknown[] = [];
        const capture: IteratingSchedulerCapture = { events, selected };
        await runReleaseDiffStage(
            {
                artifactsBuilder: artifactsBuilderReturning([]),
                scheduler: createIteratingScheduler([ 'pkg-a', 'pkg-b' ], capture)
            },
            configFor([ 'pkg-a', 'pkg-b' ]),
            [ buildResultFor('pkg-a'), buildResultFor('pkg-b') ]
        );
        assert.deepStrictEqual(capture.selected, [ 'pkg-a', 'pkg-b' ]);
    });
}

function registerChangedDiffTests(): void {
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
                artifactsBuilder: artifactsBuilderReturning(newFiles),
                scheduler: createIteratingScheduler([ 'pkg-a' ])
            },
            configFor([ 'pkg-a' ]),
            [
                buildResultFor('pkg-a', {
                    bundle: {
                        name: 'pkg-a',
                        version: '1.0.1',
                        manifestFile: { filePath: 'package.json', content: '{"name":"pkg-a","version":"1.0.1"}\n' }
                    } as never,
                    previousReleaseArtifacts: Maybe.just({ version: '1.0.0', gitHead: undefined, files: previousFiles })
                })
            ]
        );

        const entry = expectFirstEntry(result);
        assert.strictEqual(entry.state, 'changed');
        assert.strictEqual(entry.files.modified.length, 2);
        assert.strictEqual(entry.files.removed.length, 1);
        assert.strictEqual(entry.files.added.length, 0);
        assert.strictEqual(entry.versionTransition, '1.0.0 -> 1.0.1');
    });

    test('classifies an SBOM that differs only in the packtory tool version as unchanged', async function () {
        const previousSbom = buildSbomFixtureContent({ packtoryVersion: '1.2.3' });
        const currentSbom = buildSbomFixtureContent({ packtoryVersion: '9.9.9' });
        const files = await runSbomDiff(previousSbom, currentSbom);
        assert.strictEqual(files.modified.length, 0);
        assert.strictEqual(files.unchanged.length, 1);
        assert.strictEqual(files.unchanged[0]?.path, 'sbom.cdx.json');
    });

    test('still flags an SBOM as modified when it has changes beyond the packtory tool version', async function () {
        const previousSbom = buildSbomFixtureContent({
            packtoryVersion: '1.2.3',
            dependencyComponents: [ { name: 'old-dependency', version: '1.0.0' } ]
        });
        const currentSbom = buildSbomFixtureContent({
            packtoryVersion: '9.9.9',
            dependencyComponents: [ { name: 'new-dependency', version: '2.0.0' } ]
        });
        const files = await runSbomDiff(previousSbom, currentSbom);
        assert.strictEqual(files.modified.length, 1);
        assert.strictEqual(files.modified[0]?.path, 'sbom.cdx.json');
    });
}

suite('release-diff-stage', function () {
    registerBasicDiffTests();
    registerSchedulerTests();
    registerChangedDiffTests();
});
