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
    githubReleaseFlags
} from '../../test-libraries/release-handler-test-support.ts';
import { runReleaseHandler } from './release-handler.ts';

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

    test('creates GitHub releases with empty notes for current-head retry packages', async function () {
        const createReleaseIfMissing = fake.resolves('created');
        const createGitHubReleaseClient = fake(function () {
            return { createReleaseIfMissing };
        });

        const code = await runReleaseHandler(
            createReleaseHandlerDeps({
                createGitHubReleaseClient,
                flags: githubReleaseFlags,
                planOutcomes: createReleasePlanOutcomesForPackage(createCurrentHeadRetryPackage())
            })
        );

        assert.strictEqual(code, 0);
        assert.deepStrictEqual(createGitHubReleaseClient.firstCall.args, [
            { owner: 'enormora', repo: 'packtory', token: 'gh-token' }
        ]);
        assert.deepStrictEqual(createReleaseIfMissing.firstCall.args, [
            { tagName: 'pkg-a@1.0.1', name: 'pkg-a@1.0.1', body: '' }
        ]);
    });

    test('uses GITHUB_TOKEN when GH_TOKEN is not set', async function () {
        const createGitHubReleaseClient = fake(function () {
            return { createReleaseIfMissing: fake.resolves('created') };
        });

        const code = await runReleaseHandler(
            createReleaseHandlerDeps({
                createGitHubReleaseClient,
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
