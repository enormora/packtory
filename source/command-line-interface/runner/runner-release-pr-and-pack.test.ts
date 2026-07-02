import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import { createBuildReportFixture } from '../../test-libraries/preview-fixtures.ts';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import { toOutcome, toReleaseDiffOutcome } from '../../test-libraries/result-helpers.ts';
import {
    createReleasePullRequestClient,
    createReleasePullRequestConfig,
    createRunner,
    expectHelp
} from '../../test-libraries/runner-test-support.ts';

type ForwardedVendorDependencies = {
    readonly vendorDependencies: boolean;
};

type ForwardedPackFormat = {
    readonly format: string;
};

suite('runner release-pr and pack', function () {
    suite('release diff and changelog', function () {
        test('release-diff command loads the config and invokes diffAgainstLatestPublished', async function () {
            const loadConfig = fake.resolves('the-config');
            const diffAgainstLatestPublished = fake.resolves(toReleaseDiffOutcome(Result.ok([])));
            const runner = createRunner({ loadConfig, diffAgainstLatestPublished });

            const exitCode = await runner.run([ 'foo', 'bar', 'release-diff' ]);

            assert.strictEqual(exitCode, 0);
            assert.strictEqual(loadConfig.callCount, 1);
            assert.strictEqual(diffAgainstLatestPublished.callCount, 1);
            assert.strictEqual(diffAgainstLatestPublished.firstCall.args[0], 'the-config');
        });

        test('release-diff command returns exit code 1 when the result is an Err', async function () {
            const diffAgainstLatestPublished = fake.resolves(
                toReleaseDiffOutcome(Result.err({ type: 'config', issues: [ 'invalid config' ] }))
            );
            const runner = createRunner({ diffAgainstLatestPublished });

            const exitCode = await runner.run([ 'foo', 'bar', 'release-diff' ]);

            assert.strictEqual(exitCode, 1);
        });

        test('release-diff --help advertises the command as a registry-diff against the latest published version', async function () {
            const log = fake();
            const runner = createRunner({ log });

            await runner.run([ 'foo', 'bar', 'release-diff', '--help' ]);

            const helpText = String(log.firstCall.args[0]);
            assert.match(
                helpText,
                /Compares the next dry-run build against the latest published version, per package\./u
            );
        });

        test('changelog command loads the config and invokes planReleaseAgainstLatestPublished', async function () {
            const loadConfig = fake.resolves('the-config');
            const planReleaseAgainstLatestPublished = fake.resolves({
                result: Result.ok({ packages: [] }),
                getReport() {
                    return createBuildReportFixture();
                }
            });
            const runner = createRunner({ loadConfig, planReleaseAgainstLatestPublished });

            const exitCode = await runner.run([ 'foo', 'bar', 'changelog' ]);

            assert.strictEqual(exitCode, 0);
            assert.strictEqual(loadConfig.callCount, 1);
            assert.strictEqual(planReleaseAgainstLatestPublished.callCount, 1);
            assert.strictEqual(planReleaseAgainstLatestPublished.firstCall.args[0], 'the-config');
        });

        test('changelog --help advertises grouped Markdown output for the next release', async function () {
            const log = fake();
            const runner = createRunner({ log });

            await runner.run([ 'foo', 'bar', 'changelog', '--help' ]);

            const helpText = String(log.firstCall.args[0]);
            assert.match(helpText, /Generates grouped Markdown changelog output for the next release\./u);
        });
    });

    suite('release-pr commands', function () {
        test('release-pr authorize-publish writes a skipped publish decision for normal commits', async function () {
            const log = fake();
            const environment: Record<string, string> = {
                GH_TOKEN: 'gh-token',
                GITHUB_REPOSITORY: 'owner/repo',
                GITHUB_SHA: 'commit-sha'
            };
            const runner = createRunner({
                log,
                loadConfig: fake.resolves(createReleasePullRequestConfig()),
                readEnvironmentVariable(name) {
                    return environment[name];
                }
            });

            const exitCode = await runner.run([ 'foo', 'bar', 'release-pr', 'authorize-publish' ]);

            assert.strictEqual(exitCode, 0);
            assert.strictEqual(log.firstCall.args[0], 'should_publish=false');
        });

        test('release-pr authorize-publish forwards the manual release PR number', async function () {
            const fileManager = createFakeFileManager();
            const runner = createRunner({
                fileManager,
                loadConfig: fake.resolves(createReleasePullRequestConfig()),
                createReleasePullRequestGitHubClient: fake.returns(
                    createReleasePullRequestClient({
                        getPullRequest: fake.resolves({
                            author: 'github-actions[bot]',
                            baseRef: 'main',
                            changedFiles: [ 'CHANGELOG.md' ],
                            headRef: 'release/packtory',
                            headRepository: 'enormora/packtory',
                            labels: [ 'release' ],
                            mergeCommitSha: 'merge-sha',
                            merged: true,
                            number: 12,
                            subject: 'Release packages',
                            title: 'Prepare release'
                        })
                    })
                ),
                readEnvironmentVariable(name) {
                    return { GH_TOKEN: 'gh-token', GITHUB_OUTPUT: '/github-output', GITHUB_REF_NAME: 'main' }[name];
                }
            });

            const exitCode = await runner.run([
                'foo',
                'bar',
                'release-pr',
                'authorize-publish',
                '--release-pull-request',
                '12'
            ]);

            assert.strictEqual(exitCode, 0);
            assert.strictEqual(
                fileManager.getWriteFileCall(0).content.includes('release_pull_request_number=12'),
                true
            );
        });

        test('release-pr maintain routes through the release PR handler', async function () {
            const log = fake();
            const runner = createRunner({ log });

            const exitCode = await runner.run([ 'foo', 'bar', 'release-pr', 'maintain' ]);

            assert.strictEqual(exitCode, 1);
            assert.strictEqual(log.firstCall.args[0], 'Release PR writes require --no-dry-run');
        });

        test('release-pr validate routes the GitHub event through the release PR handler', async function () {
            const log = fake();
            const fileManager = createFakeFileManager({
                simulatedReadFileResponses: [ { value: JSON.stringify({ pull_request: { number: 12 } }) } ]
            });
            const environment: Record<string, string> = {
                GH_TOKEN: 'gh-token',
                GITHUB_EVENT_NAME: 'pull_request',
                GITHUB_EVENT_PATH: '/event.json',
                GITHUB_REPOSITORY: 'owner/repo'
            };
            const runner = createRunner({
                fileManager,
                loadConfig: fake.resolves(createReleasePullRequestConfig()),
                log,
                createReleasePullRequestGitHubClient: fake.returns(
                    createReleasePullRequestClient({
                        getPullRequestHead: fake.resolves({
                            author: 'maintainer',
                            changedFiles: [ 'src/index.ts' ],
                            headRef: 'feature',
                            labels: [ 'bug' ],
                            parentShas: [ 'main-head' ],
                            subject: 'Fix bug',
                            title: 'Fix bug'
                        })
                    })
                ),
                readEnvironmentVariable(name) {
                    return environment[name];
                }
            });

            const exitCode = await runner.run([ 'foo', 'bar', 'release-pr', 'validate' ]);

            assert.strictEqual(exitCode, 0);
            assert.strictEqual(log.firstCall.args[0], 'Release PR policy passed.');
        });

        test('release-pr help advertises release PR subcommands', async function () {
            const help = await expectHelp([ 'release-pr', '--help' ]);

            assert.match(help, /maintain/);
            assert.match(help, /validate/);
            assert.match(help, /authorize-publish/);
        });

        test('release-pr maintain help advertises writes and dry-run opt-in', async function () {
            const help = await expectHelp([ 'release-pr', 'maintain', '--help' ]);

            assert.match(help, /Creates or updates the generated release PR\./);
            assert.match(help, /--no-dry-run/);
        });

        test('release-pr validate help advertises GitHub event validation', async function () {
            const help = await expectHelp([ 'release-pr', 'validate', '--help' ]);

            assert.match(help, /Validates the release PR policy for the current GitHub event\./);
        });

        test('release-pr authorize-publish help advertises manual retry input', async function () {
            const help = await expectHelp([ 'release-pr', 'authorize-publish', '--help' ]);

            assert.match(help, /Authorizes publishing from a merged release PR\./);
            assert.match(help, /--release-pull-request/);
        });
    });

    suite('pack command', function () {
        test('pack command loads the config and forwards the flags into packPackage', async function () {
            const loadConfig = fake.resolves('the-config');
            const packPackage = fake.resolves(toOutcome(Result.ok(undefined)));
            const runner = createRunner({ loadConfig, packPackage });

            const exitCode = await runner.run([
                'foo',
                'bar',
                'pack',
                'pkg-a',
                '--format',
                'zip',
                '--out',
                '/workspace/pkg-a.zip',
                '--version',
                '1.2.3'
            ]);

            assert.strictEqual(exitCode, 0);
            assert.strictEqual(loadConfig.callCount, 1);
            assert.strictEqual(packPackage.callCount, 1);
            assert.strictEqual(packPackage.firstCall.args[0], 'the-config');
            assert.deepStrictEqual(packPackage.firstCall.args[1], {
                packageName: 'pkg-a',
                format: 'zip',
                outputPath: '/workspace/pkg-a.zip',
                version: '1.2.3',
                vendorDependencies: false
            });
        });

        test('pack command defaults the version to 0.0.0 when --version is omitted', async function () {
            const packPackage = fake.resolves(toOutcome(Result.ok(undefined)));
            const runner = createRunner({ packPackage });

            await runner.run([ 'foo', 'bar', 'pack', 'pkg-a', '--format', 'zip', '--out', '/workspace/pkg-a.zip' ]);

            assert.deepStrictEqual(packPackage.firstCall.args[1], {
                packageName: 'pkg-a',
                format: 'zip',
                outputPath: '/workspace/pkg-a.zip',
                version: '0.0.0',
                vendorDependencies: false
            });
        });

        test('pack command returns exit code 1 when packPackage reports an Err', async function () {
            const packPackage = fake.resolves(
                toOutcome(Result.err({ type: 'package-not-found', packageName: 'pkg-a' }))
            );
            const runner = createRunner({ packPackage });

            const exitCode = await runner.run([
                'foo',
                'bar',
                'pack',
                'pkg-a',
                '--format',
                'tar',
                '--out',
                '/workspace/pkg-a.tgz'
            ]);

            assert.strictEqual(exitCode, 1);
            assert.strictEqual(packPackage.callCount, 1);
        });

        test('pack command forwards --vendor-dependencies as true when the flag is supplied', async function () {
            const packPackage = fake.resolves(toOutcome(Result.ok(undefined)));
            const argv = 'foo,bar,pack,pkg-a,--format,zip,--out,/workspace/pkg-a.zip,--vendor-dependencies'.split(',');
            await createRunner({ packPackage }).run(argv);

            const forwarded = packPackage.firstCall.args[1] as ForwardedVendorDependencies;
            assert.strictEqual(forwarded.vendorDependencies, true);
        });

        test('pack command accepts each of the zip, tar, and folder format values and forwards them to packPackage', async function () {
            for (const format of [ 'zip', 'tar', 'folder' ] as const) {
                const packPackage = fake.resolves(toOutcome(Result.ok(undefined)));
                const runner = createRunner({ packPackage });

                await runner.run([
                    'foo',
                    'bar',
                    'pack',
                    'pkg-a',
                    '--format',
                    format,
                    '--out',
                    '/workspace/pkg-a.archive'
                ]);

                assert.strictEqual(packPackage.callCount, 1);
                const forwarded = packPackage.firstCall.args[1] as ForwardedPackFormat;
                assert.strictEqual(forwarded.format, format);
            }
        });

        test('pack --help advertises the command, positional <package>, --format, --out, and --version flags', async function () {
            const log = fake();
            const runner = createRunner({ log });

            await runner.run([ 'foo', 'bar', 'pack', '--help' ]);

            const helpText = String(log.firstCall.args[0]);
            assert.match(
                helpText,
                /Builds a single configured package and writes it as a zip, tar, or folder artifact\./u
            );
            assert.match(helpText, /<package>/u);
            assert.match(helpText, /--format/u);
            assert.match(helpText, /--out/u);
            assert.match(helpText, /--version/u);
        });

        test('pack command rejects --format values outside of zip, tar, or folder', async function () {
            const log = fake();
            const runner = createRunner({ log });

            const exitCode = await runner.run([
                'foo',
                'bar',
                'pack',
                'pkg-a',
                '--format',
                'rar',
                '--out',
                '/workspace/pkg-a.rar'
            ]);

            assert.strictEqual(exitCode, 1);
        });
    });
});
