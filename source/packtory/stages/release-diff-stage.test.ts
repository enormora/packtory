/* eslint-disable @typescript-eslint/consistent-type-assertions -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Maybe, Result } from 'true-myth';
import type { ArtifactsBuilder } from '../../artifacts/artifacts-builder.ts';
import type { ValidConfigResult } from '../../config/validation.ts';
import type { FileDescription } from '../../file-manager/file-description.ts';
import type { BuildReport, PackageReport } from '../../report/aggregator/report-types.ts';
import type { BuildAndPublishResult } from '../package-processor.ts';
import type { Scheduler as PackageScheduler } from '../scheduler.ts';
import { runReleaseDiffStage } from './release-diff-stage.ts';

type IterateParams = {
    readonly config: ValidConfigResult;
    readonly createOptions: (context: { readonly packageName: string }) => unknown;
    readonly execute: (options: unknown) => Promise<unknown>;
    readonly selectNext: (params: { readonly result: unknown; readonly options: unknown }) => unknown;
};

function iteratingScheduler(packageNames: readonly string[]): PackageScheduler {
    return {
        async runForEachScheduledPackage(params: IterateParams) {
            const results: unknown[] = [];
            const failures: Error[] = [];
            for (const packageName of packageNames) {
                const options = params.createOptions({ packageName });
                try {
                    const result = await params.execute(options);
                    results.push(result);
                } catch (error) {
                    failures.push(error as Error);
                }
            }
            if (failures.length > 0) {
                return Result.err({ succeeded: results, failures });
            }
            return Result.ok(results);
        }
    } as unknown as PackageScheduler;
}

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
            version: '1.0.1',
            manifestFile: { filePath: 'package.json', content: `{"name":"${name}","version":"1.0.1"}\n` }
        } as never,
        extraFiles: [],
        previousReleaseArtifacts: Maybe.nothing(),
        ...overrides
    };
}

function packageReportFor(previousVersion: string | undefined, chosenVersion: string): PackageReport {
    return {
        decisions: {
            version: {
                previousVersion,
                chosenVersion,
                trigger: previousVersion === undefined ? 'initial' : 'auto-patch-bump'
            }
        },
        timings: {}
    };
}

function reportFor(perPackage: Readonly<Record<string, PackageReport>>): BuildReport {
    return {
        schemaVersion: 1,
        generatedAt: '2026-05-19T00:00:00.000Z',
        packages: perPackage,
        aggregate: { crossBundleLinks: [] }
    };
}

function artifactsBuilderReturning(files: readonly FileDescription[]): Pick<ArtifactsBuilder, 'collectContents'> {
    return {
        collectContents() {
            return files;
        }
    };
}

suite('release-diff-stage', function () {
    test('skips packages that have no BuildAndPublishResult (publish-stage failed earlier)', async function () {
        const result = await runReleaseDiffStage(
            {
                artifactsBuilder: artifactsBuilderReturning([]),
                scheduler: iteratingScheduler(['pkg-a', 'pkg-broken'])
            },
            configFor(['pkg-a', 'pkg-broken']),
            [buildResultFor('pkg-a')],
            reportFor({ 'pkg-a': packageReportFor(undefined, '1.0.0') })
        );

        if (result.isErr) {
            assert.fail('expected ok result');
        }
        assert.strictEqual(result.value.length, 1);
        const [first] = result.value;
        assert.ok(first);
        assert.strictEqual(first.name, 'pkg-a');
    });

    test('produces an unchanged state when the BuildAndPublishResult is already-published', async function () {
        const result = await runReleaseDiffStage(
            {
                artifactsBuilder: artifactsBuilderReturning([]),
                scheduler: iteratingScheduler(['pkg-a'])
            },
            configFor(['pkg-a']),
            [buildResultFor('pkg-a', { status: 'already-published' })],
            reportFor({ 'pkg-a': packageReportFor('1.0.0', '1.0.0') })
        );

        if (result.isErr) {
            assert.fail('expected ok result');
        }
        const [first] = result.value;
        assert.ok(first);
        assert.strictEqual(first.state, 'unchanged');
        assert.strictEqual(first.previousVersionLabel, '1.0.0');
    });

    test('produces a first-publish state when no previous release exists, with all bundled files as added', async function () {
        const newFiles: readonly FileDescription[] = [
            { filePath: 'package.json', content: '{}', isExecutable: false },
            { filePath: 'lib/index.js', content: 'export const x = 1;\n', isExecutable: false }
        ];

        const result = await runReleaseDiffStage(
            {
                artifactsBuilder: artifactsBuilderReturning(newFiles),
                scheduler: iteratingScheduler(['pkg-a'])
            },
            configFor(['pkg-a']),
            [buildResultFor('pkg-a')],
            reportFor({ 'pkg-a': packageReportFor(undefined, '1.0.0') })
        );

        if (result.isErr) {
            assert.fail('expected ok result');
        }
        const [first] = result.value;
        assert.ok(first);
        assert.strictEqual(first.state, 'first-publish');
        assert.strictEqual(first.files.added.length, 2);
        assert.strictEqual(first.files.removed.length, 0);
        assert.strictEqual(first.versionTransition, '(unpublished) -> 1.0.0');
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
                artifactsBuilder: artifactsBuilderReturning(newFiles),
                scheduler: iteratingScheduler(['pkg-a'])
            },
            configFor(['pkg-a']),
            [
                buildResultFor('pkg-a', {
                    previousReleaseArtifacts: Maybe.just({ version: '1.0.0', files: previousFiles })
                })
            ],
            reportFor({ 'pkg-a': packageReportFor('1.0.0', '1.0.1') })
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
