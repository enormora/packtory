import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import type { PrLogEngine, ResolvePullRequestLabelsOptions } from '@pr-log/core';
import {
    assertCleanChangelogNoOp,
    createConfigWithoutChangelogOutputs,
    createEngine,
    createEngineWithoutAttributedPullRequests,
    createPackageChangelogDeps,
    createReleaseHandlerDeps,
    createReleasePackage,
    createReleasePlanOutcome,
    createReleaseStepRecorder,
    createTwoPackageChangelogConfig,
    unattributedPackageChangelogMessage,
    validConfig
} from '../../test-libraries/release-handler-test-support.ts';
import { runReleaseHandler } from './release-handler.ts';

suite('changelog writes', function () {
    test('writes changelogs without committing when only --write-changelog is set', async function () {
        const deps = createReleaseHandlerDeps({ flags: { writeChangelog: true, noDryRun: true } });

        const code = await runReleaseHandler(deps);

        assert.strictEqual(code, 0);
        assert.deepStrictEqual(deps.releaseSteps, [ 'plan', 'clean' ]);
    });

    test('logs unwritten package changelogs when attribution finds no pull requests', async function () {
        const releaseStepRecorder = createReleaseStepRecorder();
        const deps = createPackageChangelogDeps(
            releaseStepRecorder.recordReleaseStep,
            { writeChangelog: true, noDryRun: true },
            createEngineWithoutAttributedPullRequests()
        );

        await assertCleanChangelogNoOp(deps, releaseStepRecorder.releaseSteps, unattributedPackageChangelogMessage);
    });

    test('separates multiple unwritten package changelog names', async function () {
        const releaseStepRecorder = createReleaseStepRecorder();
        const deps = createReleaseHandlerDeps({
            recordReleaseStep: releaseStepRecorder.recordReleaseStep,
            engine: createEngineWithoutAttributedPullRequests(),
            flags: { writeChangelog: true, noDryRun: true },
            config: createTwoPackageChangelogConfig(),
            planOutcomes: [
                createReleasePlanOutcome([
                    createReleasePackage(),
                    createReleasePackage({ name: 'pkg-b', changelogSourceFiles: [ 'source/pkg-b.ts' ] })
                ])
            ]
        });

        await assertCleanChangelogNoOp(
            deps,
            releaseStepRecorder.releaseSteps,
            'No changelog files were written; changelog attribution found no pull requests for pkg-a, pkg-b.'
        );
    });

    test('logs unwritten changelogs when no file outputs are configured', async function () {
        const releaseStepRecorder = createReleaseStepRecorder();
        const deps = createReleaseHandlerDeps({
            recordReleaseStep: releaseStepRecorder.recordReleaseStep,
            flags: { writeChangelog: true, noDryRun: true },
            config: createConfigWithoutChangelogOutputs()
        });

        await assertCleanChangelogNoOp(deps, releaseStepRecorder.releaseSteps, 'No changelog files were written.');
    });

    test('rejects --commit when attribution writes no changelog files', async function () {
        const releaseStepRecorder = createReleaseStepRecorder();
        const deps = createPackageChangelogDeps(
            releaseStepRecorder.recordReleaseStep,
            { writeChangelog: true, commit: true, noDryRun: true },
            createEngineWithoutAttributedPullRequests()
        );

        const code = await runReleaseHandler(deps);

        assert.strictEqual(code, 1);
        assert.deepStrictEqual(releaseStepRecorder.releaseSteps, [ 'plan', 'clean' ]);
        assert.deepStrictEqual(deps.log.firstCall.args, [ unattributedPackageChangelogMessage ]);
    });

    test('writes and commits non-empty package changelog output', async function () {
        const releaseStepRecorder = createReleaseStepRecorder();
        const deps = createPackageChangelogDeps(
            releaseStepRecorder.recordReleaseStep,
            { writeChangelog: true, commit: true, noDryRun: true },
            createEngine()
        );

        const code = await runReleaseHandler(deps);

        assert.strictEqual(code, 0);
        assert.deepStrictEqual(releaseStepRecorder.releaseSteps, [
            'plan',
            'clean',
            'commit:/repo/src/pkg-a/CHANGELOG.md:Release packages',
            'plan'
        ]);
        assert.deepStrictEqual(deps.fileManager.getAllWriteFileCalls(), [
            { filePath: '/repo/src/pkg-a/CHANGELOG.md', content: '## pkg-a 1.0.1\n' }
        ]);
    });

    test('uses configured changelog labels when writing release changelogs', async function () {
        const resolvePullRequestLabels = fake(
            async function (input: ResolvePullRequestLabelsOptions) {
                assert.strictEqual(input.targetScopedLabelPattern, 'scope:{targetName}:{label}');
                assert.strictEqual(input.validLabels.get('bug'), 'Bug Fixes');
                assert.strictEqual(input.validLabels.get('operations'), 'Operations');
                return [ { id: 1, title: 'Fix package', label: 'operations' } ];
            }
        );
        const engine: PrLogEngine = {
            ...createEngine(),
            resolvePullRequestLabels
        };

        const code = await runReleaseHandler(
            createReleaseHandlerDeps({
                engine,
                flags: { writeChangelog: true, noDryRun: true },
                config: {
                    ...validConfig,
                    changelog: {
                        explicitBaseRef: 'main',
                        labels: { operations: 'Operations' },
                        outputs: [ { kind: 'repository-file', path: 'CHANGELOG.md' } ],
                        packageTagFormat: 'pkg/{packageName}/v{version}',
                        targetScopedLabelPattern: 'scope:{targetName}:{label}'
                    }
                }
            })
        );

        assert.strictEqual(code, 0);
        assert.strictEqual(resolvePullRequestLabels.callCount, 1);
    });
});
