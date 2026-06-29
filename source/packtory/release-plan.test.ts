import assert from 'node:assert';
import { suite, test } from 'mocha';
import { analyzedBundle, analyzedBundleResource } from '../test-libraries/bundle-fixtures.ts';
import { createFakeFileManager } from '../test-libraries/fake-file-manager.ts';
import {
    buildResultFor,
    previousReleaseArtifactsFor
} from '../test-libraries/release-orchestrator-fixtures.ts';
import type { ReleasePlanPackage } from './packtory-results.ts';
import { createReleasePlanPackage } from './release-plan.ts';

type ReleaseArtifactDescription = {
    readonly content: string;
    readonly filePath: string;
    readonly isExecutable: false;
};

type ReleasePlanAttributionSpec = {
    readonly currentArtifacts: readonly ReleaseArtifactDescription[];
    readonly previousArtifacts: readonly ReleaseArtifactDescription[];
    readonly releaseClassification: ReleasePlanPackage['releaseClassification'];
};

async function releasePlanPackageForAttribution(spec: ReleasePlanAttributionSpec): Promise<ReleasePlanPackage> {
    return createReleasePlanPackage(
        { fileManager: createFakeFileManager(), repositoryFolder: '/repo' },
        analyzedBundle({
            contents: [
                analyzedBundleResource('/repo/source/index.ts', { targetFilePath: 'package/index.js' }),
                analyzedBundleResource('/repo/source/readme.md', { targetFilePath: 'package/readme.md' })
            ]
        }),
        buildResultFor({
            previousReleaseArtifacts: previousReleaseArtifactsFor({
                version: '1.0.0',
                publishedAt: new Date('2026-05-01T00:00:00.000Z'),
                files: spec.previousArtifacts
            })
        }),
        {
            changelogSourceOptions: { additionalChangelogSourceFiles: { packageFiles: [], sharedFiles: [] } },
            currentGitHead: undefined,
            releaseArtifactFiles: spec.currentArtifacts,
            releaseClassification: spec.releaseClassification
        }
    );
}

suite('release-plan', function () {
    test('createReleasePlanPackage attributes all bundle sources for dependency-only release plans', async function () {
        const packagePlan = await releasePlanPackageForAttribution({
            previousArtifacts: [
                {
                    filePath: 'package/package.json',
                    content: '{"dependencies":{"alpha":"1.0.0"}}',
                    isExecutable: false
                },
                { filePath: 'package/index.js', content: 'same', isExecutable: false },
                { filePath: 'package/readme.md', content: 'same', isExecutable: false }
            ],
            currentArtifacts: [
                {
                    filePath: 'package/package.json',
                    content: '{"dependencies":{"alpha":"2.0.0"}}',
                    isExecutable: false
                },
                { filePath: 'package/index.js', content: 'same', isExecutable: false },
                { filePath: 'package/readme.md', content: 'same', isExecutable: false }
            ],
            releaseClassification: 'dependency-only'
        });

        assert.deepStrictEqual(packagePlan.changedArtifactFiles, [ 'package.json' ]);
        assert.deepStrictEqual(packagePlan.changelogSourceFiles, [ 'source/index.ts', 'source/readme.md' ]);
    });

    test('createReleasePlanPackage attributes only changed artifact sources for substantive release plans', async function () {
        const packagePlan = await releasePlanPackageForAttribution({
            previousArtifacts: [
                { filePath: 'package/index.js', content: 'old', isExecutable: false },
                { filePath: 'package/readme.md', content: 'same', isExecutable: false }
            ],
            currentArtifacts: [
                { filePath: 'package/index.js', content: 'new', isExecutable: false },
                { filePath: 'package/readme.md', content: 'same', isExecutable: false }
            ],
            releaseClassification: 'substantive'
        });

        assert.deepStrictEqual(packagePlan.changedArtifactFiles, [ 'index.js' ]);
        assert.deepStrictEqual(packagePlan.changelogSourceFiles, [ 'source/index.ts' ]);
    });
});
