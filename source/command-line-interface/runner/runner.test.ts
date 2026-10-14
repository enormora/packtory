import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import { toOutcome, toReleaseDiffOutcome } from '../../test-libraries/result-helpers.ts';
import { createPackageReleaseDiff, textModifiedFileFactory } from '../../test-libraries/release-diff-fixtures.ts';
import {
    createRunner,
    expectCommandLoadsConfiguration,
    expectHelp,
    expectSubcommandHelp
} from '../../test-libraries/runner-test-support.ts';

type LoggedCommandRun = {
    readonly buildAndPublishAll: SinonSpy;
    readonly exitCode: number;
    readonly log: SinonSpy;
};
type PackageOperationSpies = {
    readonly buildAndPublishAll: SinonSpy;
    readonly diffAgainstLatestPublished: SinonSpy;
    readonly packPackage: SinonSpy;
    readonly inspectPackageSideEffects: SinonSpy;
    readonly planReleaseAgainstLatestPublished: SinonSpy;
};

async function runWithBuildAndLog(
    buildAndPublishAll: SinonSpy,
    commandArguments: readonly string[]
): Promise<LoggedCommandRun> {
    const log = fake();
    const runner = createRunner({ buildAndPublishAll, log });
    const exitCode = await runner.run(commandArguments);
    return { buildAndPublishAll, exitCode, log };
}

function createConfigurationInspectLoadConfiguration(): SinonSpy {
    return fake.resolves({
        commonPackageSettings: {
            sourcesFolder: 'dist',
            mainPackageManifest: { type: 'module' },
            publishSettings: { access: 'public' }
        },
        packages: [ { name: 'package-a', roots: { main: { javaScript: 'index.js' } } } ]
    });
}

function createPackageOperationSpies(): PackageOperationSpies {
    return {
        buildAndPublishAll: fake.resolves(toOutcome(Result.ok([]))),
        diffAgainstLatestPublished: fake.resolves(undefined),
        inspectPackageSideEffects: fake.resolves(undefined),
        packPackage: fake.resolves(undefined),
        planReleaseAgainstLatestPublished: fake.resolves(undefined)
    };
}

function assertPackageOperationsSkipped(spies: PackageOperationSpies): void {
    assert.deepStrictEqual({
        buildAndPublishAll: spies.buildAndPublishAll.callCount,
        diffAgainstLatestPublished: spies.diffAgainstLatestPublished.callCount,
        inspectPackageSideEffects: spies.inspectPackageSideEffects.callCount,
        packPackage: spies.packPackage.callCount,
        planReleaseAgainstLatestPublished: spies.planReleaseAgainstLatestPublished.callCount
    }, {
        buildAndPublishAll: 0,
        diffAgainstLatestPublished: 0,
        inspectPackageSideEffects: 0,
        packPackage: 0,
        planReleaseAgainstLatestPublished: 0
    });
}

suite('runner command routing', function () {
    suite('publish and preview options', function () {
        test('publish command loads the config file and passes it to buildAndPublishAll()', async function () {
            await expectCommandLoadsConfiguration('publish');
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
            await expectCommandLoadsConfiguration('preview');
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

        test('configuration inspect command loads config without running package operations', async function () {
            const loadConfiguration = createConfigurationInspectLoadConfiguration();
            const spies = createPackageOperationSpies();
            const runner = createRunner({
                loadConfiguration,
                ...spies
            });

            const exitCode = await runner.run([ 'foo', 'bar', 'configuration', 'inspect' ]);

            assert.strictEqual(exitCode, 0);
            assert.strictEqual(loadConfiguration.callCount, 1);
            assertPackageOperationsSkipped(spies);
        });

        test('inspect side-effects command loads config and passes the selected package', async function () {
            const loadConfiguration = fake.resolves('the-config');
            const inspectPackageSideEffects = fake.resolves({
                result: Result.ok({
                    packageName: 'package-a',
                    packageManifestDecision: { type: 'side-effects-false' },
                    impureFiles: []
                })
            });
            const runner = createRunner({ loadConfiguration, inspectPackageSideEffects });

            const exitCode = await runner.run([ 'foo', 'bar', 'inspect', 'side-effects', 'package-a' ]);

            assert.strictEqual(exitCode, 0);
            assert.strictEqual(loadConfiguration.callCount, 1);
            assert.deepStrictEqual(inspectPackageSideEffects.firstCall.args, [ 'the-config', 'package-a' ]);
        });

        test('release-diff files-only mode suppresses text hunks from parsed CLI arguments', async function () {
            const pageOutput = fake.resolves(undefined);
            const diffAgainstLatestPublished = fake.resolves(
                toReleaseDiffOutcome(
                    Result.ok([
                        createPackageReleaseDiff({
                            files: {
                                added: [],
                                removed: [],
                                modified: [ textModifiedFileFactory.build() ],
                                unchanged: []
                            }
                        })
                    ])
                )
            );
            const runner = createRunner({ diffAgainstLatestPublished, pageOutput });

            const exitCode = await runner.run([ 'foo', 'bar', 'release-diff', '--files-only' ]);

            assert.strictEqual(exitCode, 0);
            const pagedMessage = pageOutput.firstCall.args[0] as string;
            assert.match(pagedMessage, /~ package\.json \(32 B -> 35 B\)/u);
            assert.doesNotMatch(pagedMessage, /@@ -1,1 \+1,1 @@/u);
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
            const buildAndPublishAll = fake.resolves(toOutcome(Result.err({ type: 'configuration', issues: [] })));
            const runner = createRunner({ buildAndPublishAll });

            const exitCode = await runner.run([ 'foo', 'bar', 'publish' ]);

            assert.strictEqual(exitCode, 1);
        });

        test('returns exit code 1 instead of exiting the process when command parsing fails', async function () {
            const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
            const result = await runWithBuildAndLog(buildAndPublishAll, [ 'foo', 'bar', 'not-a-command' ]);

            assert.strictEqual(result.exitCode, 1);
            assert.strictEqual(buildAndPublishAll.callCount, 0);
            assert.strictEqual(result.log.callCount, 1);
            assert.match(String(result.log.firstCall.args[0]), /packtory --help/);
        });

        test('prints root help with trace when no command is provided', async function () {
            const help = await expectHelp([]);

            assert.match(help, /--trace/u);
        });

        test('prints root help with trace for short help', async function () {
            const help = await expectHelp([ '-h' ]);

            assert.match(help, /--trace/u);
        });

        test('returns exit code 1 when the publish command name is misspelled', async function () {
            const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
            const runner = createRunner({ buildAndPublishAll });

            const exitCode = await runner.run([ 'foo', 'bar', 'publis' ]);

            assert.strictEqual(exitCode, 1);
            assert.strictEqual(buildAndPublishAll.callCount, 0);
        });

        test('returns exit code 1 and logs a concise message when a command throws without trace', async function () {
            const result = await runWithBuildAndLog(
                fake.rejects(new Error('boom')),
                [ 'foo', 'bar', 'publish', '--no-dry-run' ]
            );

            assert.strictEqual(result.exitCode, 1);
            assert.strictEqual(result.log.firstCall.args[0], 'boom');
        });

        test('returns exit code 1 and logs a stack trace when a command throws with root trace', async function () {
            const result = await runWithBuildAndLog(
                fake.rejects(new Error('boom')),
                [ 'foo', 'bar', '--trace', 'publish', '--no-dry-run' ]
            );

            assert.strictEqual(result.exitCode, 1);
            assert.match(String(result.log.firstCall.args[0]), /Stack trace: Error: boom/u);
        });

        test('rejects trace after the subcommand as an unknown argument', async function () {
            const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([])));
            const result = await runWithBuildAndLog(buildAndPublishAll, [ 'foo', 'bar', 'publish', '--trace' ]);

            assert.strictEqual(result.exitCode, 1);
            assert.strictEqual(buildAndPublishAll.callCount, 0);
            assert.match(String(result.log.firstCall.args[0]), /Unknown arguments/u);
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
            assert.ok(help.includes('configuration'), 'Expected help output to include the config command');
            assert.ok(
                help.includes('release-pull-request'),
                'Expected help output to include the release-pull-request command'
            );
            assert.ok(help.includes('--trace'), 'Expected help output to include the trace flag');
        });

        test('prints subcommand help that includes the full publish command path', async function () {
            const help = await expectSubcommandHelp('publish');

            assert.match(help, /packtory publish/);
            assert.ok(!help.includes('--trace'), 'Expected publish help to omit the root trace flag');
        });

        test('prints subcommand help that includes the full preview command path and --open flag', async function () {
            const help = await expectSubcommandHelp('preview');

            assert.match(help, /packtory preview/);
            assert.match(help, /--open/);
            assert.match(help, /Builds all packages in fresh dry-run mode and opens a human preview\./);
        });

        test('prints subcommand help that includes the release-diff files-only flag', async function () {
            const help = await expectSubcommandHelp('release-diff');

            assert.match(help, /packtory release-diff/u);
            assert.match(help, /--files-only/u);
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

        test('prints nested configuration inspect help', async function () {
            const help = await expectSubcommandHelp('configuration', 'inspect');

            assert.match(help, /packtory configuration inspect/u);
            assert.match(help, /Validates packtory\.config\.js and prints a compact package summary\./u);
        });

        test('prints nested inspect side-effects help', async function () {
            const help = await expectSubcommandHelp('inspect', 'side-effects');

            assert.match(help, /packtory inspect side-effects/u);
            assert.match(help, /Prints why package\.json sideEffects is false, listed, or omitted\./u);
            assert.match(help, /<package>/u);
        });
    });
});
