import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import {
    assertCurrentHeadRetryTag,
    createCurrentHeadRetryPackage,
    createPublishVersionSpy,
    createReleaseHandlerDeps,
    createReleasePackage,
    createReleasePlanOutcome,
    createReleasePlanOutcomesForPackage,
    createReleaseStepRecorder,
    githubReleaseFlags,
    validConfig
} from '../../test-libraries/release-handler-test-support.ts';
import { createFakeFileManager, type FakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { runReleaseHandler } from './release-handler.ts';

const currentHeadRetryChangelog = [
    '## 1.0.1 (June 13, 2026)',
    '',
    '### Bug Fixes',
    '',
    '* Fix package (#1)',
    '',
    '## 1.0.0 (June 1, 2026)',
    '',
    '* Previous release'
]
    .join('\n');

function packageChangelogConfig(): unknown {
    return {
        ...validConfig,
        changelog: { outputs: [ { kind: 'package-file', path: 'CHANGELOG.md' } ] }
    };
}

function packageChangelogFileManager(): FakeFileManager {
    return createFakeFileManager({
        simulatedReadFileResponses: [ { value: currentHeadRetryChangelog } ]
    });
}

suite('release-handler mutation flow', function () {
    test('writes changelog, commits, replans, publishes, tags, pushes, and creates GitHub releases in order', async function () {
        const releaseStepRecorder = createReleaseStepRecorder();
        const deps = createReleaseHandlerDeps({
            recordReleaseStep: releaseStepRecorder.recordReleaseStep,
            flags: {
                writeChangelog: true,
                commit: true,
                publish: true,
                tag: true,
                push: true,
                githubRelease: true,
                noDryRun: true
            },
            planOutcomes: [
                createReleasePlanOutcome([ createReleasePackage({ nextVersion: '1.0.1' }) ]),
                createReleasePlanOutcome([ createReleasePackage({ nextVersion: '1.0.2' }) ])
            ],
            buildAndPublishAll: createPublishVersionSpy(releaseStepRecorder.recordReleaseStep, '1.0.2')
        });

        const code = await runReleaseHandler(deps);

        assert.strictEqual(code, 0);
        assert.deepStrictEqual(deps.log.lastCall.args, [ 'Release completed.' ]);
        assert.deepStrictEqual(releaseStepRecorder.releaseSteps, [
            'plan',
            'clean',
            'commit:/repo/CHANGELOG.md:Release packages',
            'plan',
            'publish',
            'head',
            'tag:pkg-a@1.0.2',
            'push',
            'github-release'
        ]);
    });

    test('tags current-head registry packages without publishing during retries', async function () {
        await assertCurrentHeadRetryTag({ tag: true, noDryRun: true });
    });

    test('skips publish for current-head retry packages when --publish --tag is used', async function () {
        await assertCurrentHeadRetryTag({ publish: true, tag: true, noDryRun: true });
    });

    test('finishes tags, pushes, and GitHub releases for current-head retry packages with publish enabled', async function () {
        const buildAndPublishAll = fake();
        const deps = createReleaseHandlerDeps({
            buildAndPublishAll,
            config: packageChangelogConfig(),
            fileManager: packageChangelogFileManager(),
            flags: { publish: true, tag: true, push: true, githubRelease: true, noDryRun: true },
            planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
        });
        const code = await runReleaseHandler(deps);

        assert.strictEqual(code, 0);
        assert.strictEqual(buildAndPublishAll.callCount, 0);
        assert.deepStrictEqual(deps.releaseSteps, [
            'plan',
            'clean',
            'head',
            'tag:pkg-a@1.0.1',
            'push',
            'github-release'
        ]);
    });

    test('recovers GitHub release notes from package changelogs for current-head retry packages', async function () {
        const createReleaseIfMissing = fake.resolves('created');
        const createGitHubReleaseClient = fake(function () {
            return { createReleaseIfMissing };
        });
        const fileManager = packageChangelogFileManager();

        const code = await runReleaseHandler(
            createReleaseHandlerDeps({
                config: packageChangelogConfig(),
                createGitHubReleaseClient,
                fileManager,
                flags: githubReleaseFlags,
                planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
            })
        );

        assert.strictEqual(code, 0);
        assert.deepStrictEqual(createGitHubReleaseClient.firstCall.args, [
            { owner: 'enormora', repo: 'packtory', token: 'gh-token' }
        ]);
        assert.deepStrictEqual(createReleaseIfMissing.firstCall.args, [
            {
                tagName: 'pkg-a@1.0.1',
                name: 'pkg-a@1.0.1',
                body: [
                    '## 1.0.1 (June 13, 2026)',
                    '',
                    '### Bug Fixes',
                    '',
                    '* Fix package (#1)'
                ]
                    .join('\n')
            }
        ]);
        assert.deepStrictEqual(fileManager.getAllReadFileCalls(), [ { filePath: '/repo/src/pkg-a/CHANGELOG.md' } ]);
    });

    test('fails GitHub release creation when release notes cannot be generated', async function () {
        const createReleaseIfMissing = fake.resolves('created');
        const createGitHubReleaseClient = fake(function () {
            return { createReleaseIfMissing };
        });

        const deps = createReleaseHandlerDeps({
            createGitHubReleaseClient,
            flags: githubReleaseFlags,
            planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
        });

        const code = await runReleaseHandler(deps);

        assert.strictEqual(code, 1);
        assert.strictEqual(createReleaseIfMissing.callCount, 0);
        assert.deepStrictEqual(deps.log.firstCall.args, [
            'GitHub release notes for "pkg-a@1.0.1" could not be generated'
        ]);
    });

    test('uses GITHUB_TOKEN when GH_TOKEN is not set', async function () {
        const createGitHubReleaseClient = fake(function () {
            return { createReleaseIfMissing: fake.resolves('created') };
        });

        const code = await runReleaseHandler(
            createReleaseHandlerDeps({
                config: packageChangelogConfig(),
                createGitHubReleaseClient,
                fileManager: packageChangelogFileManager(),
                readEnvironmentVariable(name) {
                    return name === 'GITHUB_TOKEN' ? 'github-token' : undefined;
                },
                flags: githubReleaseFlags,
                planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
            })
        );

        assert.strictEqual(code, 0);
        assert.deepStrictEqual(createGitHubReleaseClient.firstCall.args, [
            { owner: 'enormora', repo: 'packtory', token: 'github-token' }
        ]);
    });
});
