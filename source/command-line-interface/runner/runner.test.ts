import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
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
            assert.ok(help.includes('release'), 'Expected help output to include the release command');
            assert.ok(
                help.includes('Publishes packages and creates release tags through the GitHub API.'),
                'Expected help output to include the release command description'
            );
            assert.ok(help.includes('changelog'), 'Expected help output to include the changelog command');
            assert.ok(help.includes('release-pr'), 'Expected help output to include the release-pr command');
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

        test('prints subcommand help that includes the release publish flags', async function () {
            const help = await expectSubcommandHelp('release');

            assert.match(help, /packtory release/);
            assert.match(help, /--publish/);
            assert.match(help, /--tag/);
            assert.match(help, /--push/);
            assert.match(help, /--github-release/);
            assert.match(help, /--no-dry-run/);
        });
    });
});
