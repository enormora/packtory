import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Maybe } from 'true-myth';
import type { FileDescription } from '../file-manager/file-description.ts';
import { createBuildResultFixture } from '../test-libraries/preview-fixtures.ts';
import { classifyPackageRelease, summarizeReleaseAnalysis } from './release-analysis.ts';

function file(filePath: string, content: string): FileDescription {
    return { filePath, content, isExecutable: false };
}

const publishedAt = new Date('2026-05-01T00:00:00.000Z');
const dependencyOnlyPackageJsonFields = [
    'bundleDependencies',
    'bundledDependencies',
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
    'peerDependenciesMeta'
] as const;

function buildResultWithPublishedFiles(
    previousFiles: readonly FileDescription[],
    status: 'already-published' | 'new-version' = 'new-version'
) {
    return createBuildResultFixture({
        status,
        packageName: 'pkg-a',
        previousReleaseArtifacts: Maybe.just({
            version: '1.0.0',
            publishedAt,
            files: previousFiles
        })
    });
}

function assertSubstantiveClassification(
    previousFiles: readonly FileDescription[],
    newFiles: readonly FileDescription[]
): void {
    const result = classifyPackageRelease(buildResultWithPublishedFiles(previousFiles), newFiles);
    assert.strictEqual(result.classification, 'substantive');
}

suite('release-analysis', function () {
    for (const packageJsonField of dependencyOnlyPackageJsonFields) {
        test(`classifyPackageRelease ignores ${packageJsonField} changes as the only published delta`, function () {
            const buildResult = buildResultWithPublishedFiles([
                file('package.json', `{"name":"pkg-a","version":"1.0.0","${packageJsonField}":{"a":"1.0.0"}}`)
            ]);

            const result = classifyPackageRelease(buildResult, [
                file('package.json', `{"name":"pkg-a","version":"1.0.1","${packageJsonField}":{"a":"1.1.0"}}`)
            ]);

            assert.strictEqual(result.classification, 'dependency-only');
        });
    }

    test('classifyPackageRelease marks dependency-only updates and preserves publish metadata', function () {
        const buildResult = buildResultWithPublishedFiles([
            file('package.json', '{"name":"pkg-a","version":"1.0.0","dependencies":{"a":"1.0.0"}}')
        ]);

        const result = classifyPackageRelease(buildResult, [
            file('package.json', '{"name":"pkg-a","version":"1.0.1","dependencies":{"a":"1.1.0"}}')
        ]);

        assert.deepStrictEqual(result, {
            classification: 'dependency-only',
            latestPublishedAt: publishedAt,
            latestPublishedVersion: '1.0.0',
            name: 'pkg-a'
        });
    });

    test('classifyPackageRelease preserves dependency-only classification when unchanged package.json arrays remain present', function () {
        const buildResult = buildResultWithPublishedFiles([
            file(
                'package.json',
                '{"name":"pkg-a","version":"1.0.0","dependencies":{"a":"1.0.0"},"stable":[{"path":"./index.js"}]}'
            )
        ]);

        const result = classifyPackageRelease(buildResult, [
            file(
                'package.json',
                '{"name":"pkg-a","version":"1.0.1","dependencies":{"a":"1.1.0"},"stable":[{"path":"./index.js"}]}'
            )
        ]);

        assert.strictEqual(result.classification, 'dependency-only');
    });

    test('classifyPackageRelease preserves dependency-only classification for nested dependency objects inside package.json arrays', function () {
        const buildResult = buildResultWithPublishedFiles([
            file('package.json', '{"name":"pkg-a","version":"1.0.0","stable":[{"dependencies":{"a":"1.0.0"}}]}')
        ]);

        const result = classifyPackageRelease(buildResult, [
            file('package.json', '{"name":"pkg-a","version":"1.0.1","stable":[{"dependencies":{"a":"1.1.0"}}]}')
        ]);

        assert.strictEqual(result.classification, 'dependency-only');
    });

    test('classifyPackageRelease rejects non-dependency package.json field changes as substantive', function () {
        assertSubstantiveClassification(
            [file('package.json', '{"name":"pkg-a","version":"1.0.0","exports":"./index.js"}')],
            [file('package.json', '{"name":"pkg-a","version":"1.0.1","exports":"./dist/index.js"}')]
        );
    });

    test('classifyPackageRelease treats invalid package.json contents as substantive', function () {
        assertSubstantiveClassification(
            [file('package.json', 'not-json')],
            [file('package.json', '{"name":"pkg-a","version":"1.0.1"}')]
        );
    });

    test('classifyPackageRelease treats invalid new package.json contents as substantive', function () {
        assertSubstantiveClassification(
            [file('package.json', '{"name":"pkg-a","version":"1.0.0"}')],
            [file('package.json', 'not-json')]
        );
    });

    test('classifyPackageRelease treats pairs of invalid package.json contents as substantive', function () {
        assertSubstantiveClassification([file('package.json', 'not-json')], [file('package.json', 'still-not-json')]);
    });

    test('classifyPackageRelease rejects non-package.json file changes as substantive', function () {
        assertSubstantiveClassification(
            [file('package.json', '{"name":"pkg-a","version":"1.0.0"}'), file('index.js', 'export const value = 1;\n')],
            [file('package.json', '{"name":"pkg-a","version":"1.0.1"}'), file('index.js', 'export const value = 2;\n')]
        );
    });

    test('classifyPackageRelease treats packages without package.json in the published artifacts as substantive', function () {
        assertSubstantiveClassification(
            [file('index.js', 'export const value = 1;\n')],
            [file('index.js', 'export const value = 1;\n')]
        );
    });

    test('classifyPackageRelease treats differing file counts as substantive', function () {
        assertSubstantiveClassification(
            [file('package.json', '{"name":"pkg-a","version":"1.0.0"}')],
            [file('package.json', '{"name":"pkg-a","version":"1.0.1"}'), file('index.js', 'export const value = 1;\n')]
        );
    });

    test('classifyPackageRelease treats duplicate published file paths as substantive when file counts differ', function () {
        assertSubstantiveClassification(
            [file('package.json', '{"name":"pkg-a","version":"1.0.0"}')],
            [
                file('package.json', '{"name":"pkg-a","version":"1.0.1"}'),
                file('package.json', '{"name":"pkg-a","version":"1.0.1"}')
            ]
        );
    });

    test('classifyPackageRelease treats changed file paths as substantive', function () {
        assertSubstantiveClassification(
            [file('package.json', '{"name":"pkg-a","version":"1.0.0"}')],
            [file('manifest.json', '{"name":"pkg-a","version":"1.0.1"}')]
        );
    });

    test('classifyPackageRelease marks already-published build results as unchanged', function () {
        const buildResult = buildResultWithPublishedFiles(
            [file('package.json', '{"name":"pkg-a","version":"1.0.0"}')],
            'already-published'
        );

        const result = classifyPackageRelease(buildResult, [
            file('package.json', '{"name":"pkg-a","version":"1.0.0"}')
        ]);

        assert.strictEqual(result.classification, 'unchanged');
    });

    test('classifyPackageRelease marks unpublished packages as first-publish', function () {
        const result = classifyPackageRelease(createBuildResultFixture({ packageName: 'pkg-a' }), [
            file('package.json', '{"name":"pkg-a","version":"1.0.0"}')
        ]);

        assert.strictEqual(result.classification, 'first-publish');
    });

    test('summarizeReleaseAnalysis uses the most conservative changed classification and latest publish time', function () {
        const result = summarizeReleaseAnalysis([
            {
                classification: 'dependency-only',
                latestPublishedAt: new Date('2026-05-02T00:00:00.000Z'),
                latestPublishedVersion: '1.0.0',
                name: 'pkg-a'
            },
            {
                classification: 'substantive',
                latestPublishedAt: new Date('2026-05-03T00:00:00.000Z'),
                latestPublishedVersion: '2.0.0',
                name: 'pkg-b'
            }
        ]);

        assert.strictEqual(result.classification, 'substantive');
        assert.deepStrictEqual(result.mostRecentPublishedAt, new Date('2026-05-03T00:00:00.000Z'));
    });

    test('summarizeReleaseAnalysis stays unchanged when every package analysis is unchanged', function () {
        const result = summarizeReleaseAnalysis([
            {
                classification: 'unchanged',
                latestPublishedAt: new Date('2026-05-03T00:00:00.000Z'),
                latestPublishedVersion: '2.0.0',
                name: 'pkg-a'
            }
        ]);

        assert.strictEqual(result.classification, 'unchanged');
        assert.strictEqual(result.mostRecentPublishedAt, undefined);
    });

    test('summarizeReleaseAnalysis prefers first-publish over dependency-only', function () {
        const result = summarizeReleaseAnalysis([
            {
                classification: 'dependency-only',
                latestPublishedAt: new Date('2026-05-02T00:00:00.000Z'),
                latestPublishedVersion: '1.0.0',
                name: 'pkg-a'
            },
            {
                classification: 'first-publish',
                name: 'pkg-b'
            }
        ]);

        assert.strictEqual(result.classification, 'first-publish');
    });

    test('summarizeReleaseAnalysis preserves a stronger earlier classification when later analyses are weaker', function () {
        const result = summarizeReleaseAnalysis([
            {
                classification: 'first-publish',
                name: 'pkg-a'
            },
            {
                classification: 'dependency-only',
                latestPublishedAt: new Date('2026-05-02T00:00:00.000Z'),
                latestPublishedVersion: '1.0.0',
                name: 'pkg-b'
            }
        ]);

        assert.strictEqual(result.classification, 'first-publish');
    });

    test('summarizeReleaseAnalysis leaves mostRecentPublishedAt undefined for first-publish-only changes', function () {
        const result = summarizeReleaseAnalysis([
            {
                classification: 'first-publish',
                name: 'pkg-a'
            }
        ]);

        assert.strictEqual(result.classification, 'first-publish');
        assert.strictEqual(result.mostRecentPublishedAt, undefined);
    });

    test('summarizeReleaseAnalysis uses dependency-only when it is the strongest changed classification', function () {
        const result = summarizeReleaseAnalysis([
            {
                classification: 'dependency-only',
                latestPublishedAt: new Date('2026-05-02T00:00:00.000Z'),
                latestPublishedVersion: '1.0.0',
                name: 'pkg-a'
            }
        ]);

        assert.strictEqual(result.classification, 'dependency-only');
        assert.deepStrictEqual(result.mostRecentPublishedAt, new Date('2026-05-02T00:00:00.000Z'));
    });

    test('summarizeReleaseAnalysis keeps the latest published timestamp even when later entries are older', function () {
        const result = summarizeReleaseAnalysis([
            {
                classification: 'dependency-only',
                latestPublishedAt: new Date('2026-05-03T00:00:00.000Z'),
                latestPublishedVersion: '2.0.0',
                name: 'pkg-a'
            },
            {
                classification: 'dependency-only',
                latestPublishedAt: new Date('2026-05-02T00:00:00.000Z'),
                latestPublishedVersion: '1.0.0',
                name: 'pkg-b'
            }
        ]);

        assert.deepStrictEqual(result.mostRecentPublishedAt, new Date('2026-05-03T00:00:00.000Z'));
    });

    test('summarizeReleaseAnalysis preserves the first matching date object when later timestamps are equal', function () {
        const firstPublishedAt = new Date('2026-05-03T00:00:00.000Z');
        const secondPublishedAt = new Date('2026-05-03T00:00:00.000Z');

        const result = summarizeReleaseAnalysis([
            {
                classification: 'dependency-only',
                latestPublishedAt: firstPublishedAt,
                latestPublishedVersion: '2.0.0',
                name: 'pkg-a'
            },
            {
                classification: 'dependency-only',
                latestPublishedAt: secondPublishedAt,
                latestPublishedVersion: '2.0.1',
                name: 'pkg-b'
            }
        ]);

        assert.strictEqual(result.mostRecentPublishedAt, firstPublishedAt);
    });
});
