import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import { createBuildReportFixture } from '../../test-libraries/preview-fixtures.ts';
import { toOutcome } from '../../test-libraries/result-helpers.ts';
import {
    createRunner,
    expectCommandLoadsConfig,
    expectHelp,
    expectSubcommandHelp
} from '../../test-libraries/runner-test-support.ts';

suite('runner command routing', function () {
    suite('publish and preview options', function () {
        test('publish command loads the config file and passes it to buildAndPublishAll()', async function () {
            await expectCommandLoadsConfig('publish');
        });

        test('publish command runs in dry-run mode per default', async function () {
            const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
            const runner = createRunner({ buildAndPublishAll });

            await runner.run([ 'foo', 'bar', 'publish' ]);

            assert.strictEqual(buildAndPublishAll.callCount, 1);
            assert.deepStrictEqual(buildAndPublishAll.firstCall.args[1], {
                dryRun: true,
                stage: false,
                collectReport: false
            });
        });

        test('publish command runs not in dry-run mode when no-dry-run flag is set', async function () {
            const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
            const runner = createRunner({ buildAndPublishAll });

            await runner.run([ 'foo', 'bar', 'publish', '--no-dry-run' ]);

            assert.strictEqual(buildAndPublishAll.callCount, 1);
            assert.deepStrictEqual(buildAndPublishAll.firstCall.args[1], {
                dryRun: false,
                stage: false,
                collectReport: false
            });
        });

        test('publish command enables staged publishing when --stage is set', async function () {
            const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
            const runner = createRunner({ buildAndPublishAll });

            await runner.run([ 'foo', 'bar', 'publish', '--stage' ]);

            assert.strictEqual(buildAndPublishAll.callCount, 1);
            assert.deepStrictEqual(buildAndPublishAll.firstCall.args[1], {
                dryRun: true,
                stage: true,
                collectReport: false
            });
        });

        test('preview command loads the config file and passes it to buildAndPublishAll()', async function () {
            await expectCommandLoadsConfig('preview');
        });

        test('release command loads the config file and plans the release', async function () {
            const loadConfig = fake.resolves('the-config');
            const planReleaseAgainstLatestPublished = fake.resolves({
                result: Result.ok({ packages: [] }),
                getReport() {
                    return createBuildReportFixture();
                }
            });
            const runner = createRunner({ loadConfig, planReleaseAgainstLatestPublished });

            const exitCode = await runner.run([ 'foo', 'bar', 'release' ]);

            assert.strictEqual(exitCode, 0);
            assert.deepStrictEqual(planReleaseAgainstLatestPublished.firstCall.args, [ 'the-config' ]);
        });

        test('release command parses release action flags', async function () {
            const planReleaseAgainstLatestPublished = fake.resolves({
                result: Result.ok({
                    packages: [
                        {
                            name: 'pkg-a',
                            previousVersion: '1.0.0',
                            nextVersion: '1.0.1',
                            artifactState: 'changed',
                            changed: true,
                            previousGitHead: 'old-head',
                            currentGitHead: 'new-head',
                            latestRegistryMetadata: { version: '1.0.0', publishedAt: undefined, gitHead: 'old-head' },
                            artifactFiles: [],
                            changedArtifactFiles: [],
                            sourceFiles: [],
                            changelogSourceFiles: []
                        }
                    ]
                }),
                getReport() {
                    return createBuildReportFixture();
                }
            });
            const buildAndPublishAll = fake.resolves(
                toOutcome(Result.ok([ { bundle: { name: 'pkg-a', version: '1.0.1' } } ]))
            );
            const ensureTag = fake.resolves(undefined);
            const pushFollowTags = fake.resolves(undefined);
            const runner = createRunner({
                buildAndPublishAll,
                planReleaseAgainstLatestPublished,
                releaseGitClient: {
                    commit: fake.resolves(undefined),
                    currentHead: fake.resolves('new-head'),
                    deleteRemoteBranch: fake.resolves(undefined),
                    ensureClean: fake.resolves(undefined),
                    ensureTag,
                    pushHeadToBranch: fake.resolves(undefined),
                    pushFollowTags
                }
            });

            const exitCode = await runner.run([
                'foo',
                'bar',
                'release',
                '--publish',
                '--tag',
                '--push',
                '--no-dry-run'
            ]);

            assert.strictEqual(exitCode, 0);
            assert.deepStrictEqual(buildAndPublishAll.firstCall.args[1], {
                dryRun: false,
                stage: false,
                collectReport: false
            });
            assert.strictEqual(ensureTag.callCount, 1);
            assert.strictEqual(pushFollowTags.callCount, 1);
        });

        test('release command parses the commit flag', async function () {
            const log = fake();
            const runner = createRunner({ log });

            const exitCode = await runner.run([ 'foo', 'bar', 'release', '--commit', '--no-dry-run' ]);

            assert.strictEqual(exitCode, 1);
            assert.deepStrictEqual(log.firstCall.args, [ '--commit requires --write-changelog' ]);
        });

        test('preview command always runs in dry-run mode with collectReport enabled', async function () {
            const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
            const runner = createRunner({ buildAndPublishAll });

            await runner.run([ 'foo', 'bar', 'preview' ]);

            assert.deepStrictEqual(buildAndPublishAll.firstCall.args[1], {
                dryRun: true,
                stage: false,
                collectReport: true
            });
        });
    });

    suite('exit codes', function () {
        test('returns exit code 0 when publish command had no errors', async function () {
            const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
            const runner = createRunner({ buildAndPublishAll });

            const exitCode = await runner.run([ 'foo', 'bar', 'publish' ]);

            assert.strictEqual(exitCode, 0);
        });

        test('returns exit code 1 when publish command has errors', async function () {
            const buildAndPublishAll = fake.resolves(toOutcome(Result.err({ type: 'config', issues: [] })));
            const runner = createRunner({ buildAndPublishAll });

            const exitCode = await runner.run([ 'foo', 'bar', 'publish' ]);

            assert.strictEqual(exitCode, 1);
        });

        test('returns exit code 1 instead of exiting the process when command parsing fails', async function () {
            const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
            const log = fake();
            const runner = createRunner({ buildAndPublishAll, log });

            const exitCode = await runner.run([ 'foo', 'bar', 'not-a-command' ]);

            assert.strictEqual(exitCode, 1);
            assert.strictEqual(buildAndPublishAll.callCount, 0);
            assert.strictEqual(log.callCount, 1);
            assert.match(String(log.firstCall.args[0]), /packtory --help/);
        });

        test('returns exit code 1 when the publish command name is misspelled', async function () {
            const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
            const runner = createRunner({ buildAndPublishAll });

            const exitCode = await runner.run([ 'foo', 'bar', 'publis' ]);

            assert.strictEqual(exitCode, 1);
            assert.strictEqual(buildAndPublishAll.callCount, 0);
        });
    });

    suite('help output', function () {
        test('prints command help that includes the publish command name and description', async function () {
            const help = await expectHelp([ '--help' ]);

            assert.ok(help.includes('publish'), 'Expected help output to include the publish command name');
            assert.ok(
                help.includes('Builds and publishes all packages (dry-run enabled by default).'),
                'Expected help output to include the publish command description'
            );
            assert.ok(help.includes('preview'), 'Expected help output to include the preview command');
            assert.ok(help.includes('changelog'), 'Expected help output to include the changelog command');
            assert.ok(help.includes('release'), 'Expected help output to include the release command');
        });

        test('prints subcommand help that includes the full publish command path', async function () {
            assert.match(await expectSubcommandHelp('publish'), /packtory publish/);
        });

        test('prints subcommand help that includes the full preview command path and --open flag', async function () {
            const help = await expectSubcommandHelp('preview');

            assert.match(help, /packtory preview/);
            assert.match(help, /--open/);
            assert.match(help, /Builds all packages in fresh dry-run mode and opens a human preview\./);
        });

        test('prints release subcommand help with release action flags', async function () {
            const help = await expectSubcommandHelp('release');

            assert.match(help, /packtory release/);
            assert.match(help, /Plans or runs a release workflow\./);
            assert.match(help, /--write-changelog/);
            assert.match(help, /--github-release/);
            assert.match(help, /--no-dry-run/);
        });
    });
});
