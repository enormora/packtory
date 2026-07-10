import assert from 'node:assert';
import { suite, test } from 'mocha';
import { analyzedBundle, analyzedBundleResource } from '../test-libraries/bundle-fixtures.ts';
import {
    buildResultFor,
    previousReleaseArtifactsFor
} from '../test-libraries/release-orchestrator-fixtures.ts';
import type { AnalyzedBundleResource } from '../dead-code-eliminator/analyzed-bundle.ts';
import { createReleasePlanPackage } from './release-plan.ts';

type ArtifactFile = {
    readonly content: string;
    readonly filePath: string;
    readonly isExecutable: false;
};

type ReleasePlanFixture = {
    readonly additionalChangelogSourceFiles: readonly string[];
    readonly bundleContents: readonly AnalyzedBundleResource[];
    readonly currentArtifactFiles: readonly ArtifactFile[];
    readonly previousArtifactFiles: readonly ArtifactFile[];
};

function artifactFile(filePath: string, content: string): ArtifactFile {
    return { filePath, content, isExecutable: false };
}

function readmeBundleResource(targetFilePath: string): AnalyzedBundleResource {
    return analyzedBundleResource('/source/packages/pkg-a/README.md', { targetFilePath });
}

async function releasePlanFor(input: ReleasePlanFixture): ReturnType<typeof createReleasePlanPackage> {
    return createReleasePlanPackage(
        {
            fileManager: {
                async checkReadability() {
                    return { isReadable: true };
                },
                async readFile() {
                    return '';
                }
            },
            repositoryFolder: '/'
        },
        analyzedBundle({
            name: 'pkg-a',
            contents: input.bundleContents
        }),
        buildResultFor({
            previousReleaseArtifacts: previousReleaseArtifactsFor({
                version: '1.0.0',
                publishedAt: new Date('2026-05-01T00:00:00.000Z'),
                files: input.previousArtifactFiles
            })
        }),
        {
            changelogSourceOptions: {
                additionalChangelogSourceFiles: {
                    packageFiles: input.additionalChangelogSourceFiles,
                    sharedFiles: []
                }
            },
            currentGitHead: undefined,
            releaseArtifactFiles: input.currentArtifactFiles,
            releaseClassification: 'substantive'
        }
    );
}

suite('packtory-release-plan changelog attribution', function () {
    test('attributes changed shipped additional file content', async function () {
        const result = await releasePlanFor({
            additionalChangelogSourceFiles: [],
            bundleContents: [ readmeBundleResource('package/README.md') ],
            previousArtifactFiles: [ artifactFile('package/README.md', 'old') ],
            currentArtifactFiles: [ artifactFile('package/README.md', 'new') ]
        });

        assert.partialDeepStrictEqual(result, {
            changedArtifactFiles: [ 'README.md' ],
            changelogSourceFiles: [ 'source/packages/pkg-a/README.md' ]
        });
    });

    test('attributes changed shipped additional file target paths', async function () {
        const result = await releasePlanFor({
            additionalChangelogSourceFiles: [],
            bundleContents: [ readmeBundleResource('package/docs/README.md') ],
            previousArtifactFiles: [ artifactFile('package/README.md', 'readme') ],
            currentArtifactFiles: [ artifactFile('package/docs/README.md', 'readme') ]
        });

        assert.partialDeepStrictEqual(result, {
            changedArtifactFiles: [ 'README.md', 'docs/README.md' ],
            changelogSourceFiles: [ 'source/packages/pkg-a/README.md' ]
        });
    });

    test('ignores source-only moves whose shipped target artifact is unchanged', async function () {
        const result = await releasePlanFor({
            additionalChangelogSourceFiles: [ 'source/packages/pkg-a/README.md' ],
            bundleContents: [
                analyzedBundleResource('/source/pkg-a.js', { targetFilePath: 'package/index.js' }),
                readmeBundleResource('package/README.md')
            ],
            previousArtifactFiles: [
                artifactFile('package/index.js', 'old'),
                artifactFile('package/README.md', 'readme')
            ],
            currentArtifactFiles: [
                artifactFile('package/index.js', 'new'),
                artifactFile('package/README.md', 'readme')
            ]
        });

        assert.partialDeepStrictEqual(result, {
            changedArtifactFiles: [ 'index.js' ],
            changelogSourceFiles: [ 'source/pkg-a.js' ]
        });
    });

    test('attributes additional package manifest sources when generated package manifests change', async function () {
        const generatedManifest = {
            ...analyzedBundleResource('/source/generated-package-json.js', { targetFilePath: 'package/package.json' }),
            isGeneratedManifest: true as const
        };

        const result = await releasePlanFor({
            additionalChangelogSourceFiles: [
                'source/packages/pkg-a/package.json',
                'source/packages/pkg-a/README.md'
            ],
            bundleContents: [ generatedManifest ],
            previousArtifactFiles: [ artifactFile('package/package.json', '{"type":"module"}') ],
            currentArtifactFiles: [ artifactFile('package/package.json', '{"type":"module","sideEffects":false}') ]
        });

        assert.partialDeepStrictEqual(result, {
            changedArtifactFiles: [ 'package.json' ],
            changelogSourceFiles: [ 'source/packages/pkg-a/package.json' ]
        });
    });

    test('ignores additional package manifest sources when generated package manifests are unchanged', async function () {
        const generatedManifest = {
            ...analyzedBundleResource('/source/generated-package-json.js', { targetFilePath: 'package/package.json' }),
            isGeneratedManifest: true as const
        };

        const result = await releasePlanFor({
            additionalChangelogSourceFiles: [ 'source/packages/pkg-a/package.json' ],
            bundleContents: [
                analyzedBundleResource('/source/pkg-a.js', { targetFilePath: 'package/index.js' }),
                generatedManifest
            ],
            previousArtifactFiles: [
                artifactFile('package/index.js', 'old'),
                artifactFile('package/package.json', '{"type":"module"}')
            ],
            currentArtifactFiles: [
                artifactFile('package/index.js', 'new'),
                artifactFile('package/package.json', '{"type":"module"}')
            ]
        });

        assert.partialDeepStrictEqual(result, {
            changedArtifactFiles: [ 'index.js' ],
            changelogSourceFiles: [ 'source/pkg-a.js' ]
        });
    });
});
