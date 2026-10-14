import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import { createFakeFileManager } from '../../test-libraries/fake-file-manager.ts';
import {
    expectCommandPlansRelease,
    packAllArguments,
    packAllFolderArguments,
    releasePlanOutcome,
    type ForwardedPackFormat,
    type ForwardedVendorDependencies
} from '../../test-libraries/release-command-routing-fixtures.ts';
import { toOutcome, toReleaseDiffOutcome } from '../../test-libraries/result-helpers.ts';
import {
    createReleasePullRequestClient,
    createReleasePullRequestConfiguration,
    createRunner,
    expectHelp
} from '../../test-libraries/runner-test-support.ts';

suite('runner release-pull-request and pack', function () {
    suite('release diff and changelog', function () {
        test('release command loads the config and plans the release', async function () {
            await expectCommandPlansRelease('release');
        });

        test('release command forwards publish flags into the release handler', async function () {
            const buildAndPublishAll = fake.resolves(toOutcome(Result.ok([
                {
                    status: 'new-version',
                    bundle: { name: 'package-a', version: '1.0.1' },
                    publication: { type: 'published' },
                    extraFiles: [],
                    previousReleaseArtifacts: { isJust: false }
                }
            ])));
            const planReleaseAgainstLatestPublished = fake.resolves(releasePlanOutcome([
                {
                    name: 'package-a',
                    previousVersion: '1.0.0',
                    nextVersion: '1.0.1',
                    artifactState: 'changed',
                    releaseClassification: 'substantive',
                    changed: true,
                    previousGitHead: 'old-head',
                    currentGitHead: 'release-head',
                    latestRegistryMetadata: undefined,
                    artifactFiles: [ 'index.js' ],
                    changedArtifactFiles: [ 'index.js' ],
                    sourceFiles: [ 'source/package-a/index.ts' ],
                    changelogDependencyNames: [],
                    changelogDependencyUpdates: [],
                    changelogSourceFiles: [ 'source/package-a/index.ts' ]
                }
            ]));
            const runner = createRunner({ buildAndPublishAll, planReleaseAgainstLatestPublished });

            const exitCode = await runner.run([ 'foo', 'bar', 'release', '--publish', '--no-dry-run' ]);

            assert.strictEqual(exitCode, 0);
            assert.strictEqual(buildAndPublishAll.callCount, 1);
        });

        test('release-diff command loads the config and invokes diffAgainstLatestPublished', async function () {
            const loadConfiguration = fake.resolves('the-config');
            const diffAgainstLatestPublished = fake.resolves(toReleaseDiffOutcome(Result.ok([])));
            const runner = createRunner({ loadConfiguration, diffAgainstLatestPublished });

            const exitCode = await runner.run([ 'foo', 'bar', 'release-diff' ]);

            assert.strictEqual(exitCode, 0);
            assert.strictEqual(loadConfiguration.callCount, 1);
            assert.strictEqual(diffAgainstLatestPublished.callCount, 1);
            assert.strictEqual(diffAgainstLatestPublished.firstCall.args[0], 'the-config');
        });

        test('release-diff command returns exit code 1 when the result is an Err', async function () {
            const diffAgainstLatestPublished = fake.resolves(
                toReleaseDiffOutcome(Result.err({ type: 'configuration', issues: [ 'invalid config' ] }))
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
            await expectCommandPlansRelease('changelog');
        });

        test('changelog --help advertises grouped Markdown output for the next release', async function () {
            const log = fake();
            const runner = createRunner({ log });

            await runner.run([ 'foo', 'bar', 'changelog', '--help' ]);

            const helpText = String(log.firstCall.args[0]);
            assert.match(helpText, /Generates grouped Markdown changelog output for the next release\./u);
        });
    });

    suite('release-pull-request commands', function () {
        test('release-pull-request authorize-publish writes a skipped publish decision for normal commits', async function () {
            const log = fake();
            const environment: Record<string, string> = {
                GH_TOKEN: 'gh-token',
                GITHUB_REPOSITORY: 'owner/repo',
                GITHUB_SHA: 'commit-sha'
            };
            const runner = createRunner({
                log,
                loadConfiguration: fake.resolves(createReleasePullRequestConfiguration()),
                readEnvironmentVariable(name) {
                    return environment[name];
                }
            });

            const exitCode = await runner.run([ 'foo', 'bar', 'release-pull-request', 'authorize-publish' ]);

            assert.strictEqual(exitCode, 0);
            assert.strictEqual(log.firstCall.args[0], 'should_publish=false');
        });

        test('release-pull-request authorize-publish forwards the manual release PR number', async function () {
            const fileManager = createFakeFileManager();
            const runner = createRunner({
                fileManager,
                loadConfiguration: fake.resolves(createReleasePullRequestConfiguration()),
                createReleasePullRequestGitHubClient: fake.returns(
                    createReleasePullRequestClient({
                        getPullRequest: fake.resolves({
                            author: 'github-actions[bot]',
                            baseReference: 'main',
                            changedFiles: [ 'CHANGELOG.md' ],
                            headReference: 'release/packtory',
                            headRepository: 'enormora/packtory',
                            labels: [ 'release' ],
                            mergeCommitHash: 'merge-sha',
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
                'release-pull-request',
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

        test('release-pull-request maintain routes through the release PR handler', async function () {
            const log = fake();
            const runner = createRunner({ log });

            const exitCode = await runner.run([ 'foo', 'bar', 'release-pull-request', 'maintain' ]);

            assert.strictEqual(exitCode, 1);
            assert.strictEqual(log.firstCall.args[0], 'Release PR writes require --no-dry-run');
        });

        test('release-pull-request validate routes the GitHub event through the release PR handler', async function () {
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
                loadConfiguration: fake.resolves(createReleasePullRequestConfiguration()),
                log,
                createReleasePullRequestGitHubClient: fake.returns(
                    createReleasePullRequestClient({
                        getPullRequestHead: fake.resolves({
                            author: 'maintainer',
                            changedFiles: [ 'source/index.ts' ],
                            headReference: 'feature',
                            labels: [ 'bug' ],
                            parentHashes: [ 'main-head' ],
                            subject: 'Fix bug',
                            title: 'Fix bug'
                        })
                    })
                ),
                readEnvironmentVariable(name) {
                    return environment[name];
                }
            });

            const exitCode = await runner.run([ 'foo', 'bar', 'release-pull-request', 'validate' ]);

            assert.strictEqual(exitCode, 0);
            assert.strictEqual(log.firstCall.args[0], 'Release PR policy passed.');
        });

        test('release-pull-request help advertises release PR subcommands', async function () {
            const help = await expectHelp([ 'release-pull-request', '--help' ]);

            assert.match(help, /maintain/);
            assert.match(help, /validate/);
            assert.match(help, /authorize-publish/);
        });

        test('release-pull-request maintain help advertises writes and dry-run opt-in', async function () {
            const help = await expectHelp([ 'release-pull-request', 'maintain', '--help' ]);

            assert.match(help, /Creates or updates the generated release PR\./);
            assert.match(help, /--no-dry-run/);
        });

        test('release-pull-request validate help advertises GitHub event validation', async function () {
            const help = await expectHelp([ 'release-pull-request', 'validate', '--help' ]);

            assert.match(help, /Validates the release PR policy for the current GitHub event\./);
        });

        test('release-pull-request authorize-publish help advertises manual retry input', async function () {
            const help = await expectHelp([ 'release-pull-request', 'authorize-publish', '--help' ]);

            assert.match(help, /Authorizes publishing from a merged release PR\./);
            assert.match(help, /--release-pull-request/);
        });
    });

    suite('pack command', function () {
        test('pack command loads the config and forwards the flags into packPackage', async function () {
            const loadConfiguration = fake.resolves('the-config');
            const packPackage = fake.resolves(toOutcome(Result.ok(undefined)));
            const runner = createRunner({ loadConfiguration, packPackage });

            const exitCode = await runner.run([
                'foo',
                'bar',
                'pack',
                'package-a',
                '--format',
                'zip',
                '--out',
                '/workspace/package-a.zip',
                '--version',
                '1.2.3'
            ]);

            assert.strictEqual(exitCode, 0);
            assert.strictEqual(loadConfiguration.callCount, 1);
            assert.strictEqual(packPackage.callCount, 1);
            assert.strictEqual(packPackage.firstCall.args[0], 'the-config');
            assert.deepStrictEqual(packPackage.firstCall.args[1], {
                packageName: 'package-a',
                format: 'zip',
                outputPath: '/workspace/package-a.zip',
                version: '1.2.3',
                vendorDependencies: false
            });
        });

        test('pack command defaults the version to 0.0.0 when --version is omitted', async function () {
            const packPackage = fake.resolves(toOutcome(Result.ok(undefined)));
            const runner = createRunner({ packPackage });

            await runner.run([
                'foo',
                'bar',
                'pack',
                'package-a',
                '--format',
                'zip',
                '--out',
                '/workspace/package-a.zip'
            ]);

            assert.deepStrictEqual(packPackage.firstCall.args[1], {
                packageName: 'package-a',
                format: 'zip',
                outputPath: '/workspace/package-a.zip',
                version: '0.0.0',
                vendorDependencies: false
            });
        });

        test('pack command returns exit code 1 when packPackage reports an Err', async function () {
            const packPackage = fake.resolves(
                toOutcome(Result.err({ type: 'package-not-found', packageName: 'package-a' }))
            );
            const runner = createRunner({ packPackage });

            const exitCode = await runner.run([
                'foo',
                'bar',
                'pack',
                'package-a',
                '--format',
                'tar',
                '--out',
                '/workspace/package-a.tgz'
            ]);

            assert.strictEqual(exitCode, 1);
            assert.strictEqual(packPackage.callCount, 1);
        });

        test('pack command forwards --vendor-dependencies as true when the flag is supplied', async function () {
            const packPackage = fake.resolves(toOutcome(Result.ok(undefined)));
            const argumentValues =
                'foo,bar,pack,package-a,--format,zip,--out,/workspace/package-a.zip,--vendor-dependencies'.split(',');
            await createRunner({ packPackage }).run(argumentValues);

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
                    'package-a',
                    '--format',
                    format,
                    '--out',
                    '/workspace/package-a.archive'
                ]);

                assert.strictEqual(packPackage.callCount, 1);
                const forwarded = packPackage.firstCall.args[1] as ForwardedPackFormat;
                assert.strictEqual(forwarded.format, format);
            }
        });

        test('pack --help advertises the command, package argument, --all, --format, --out, and --version flags', async function () {
            const log = fake();
            const runner = createRunner({ log });

            await runner.run([ 'foo', 'bar', 'pack', '--help' ]);

            const helpText = String(log.firstCall.args[0]);
            assert.match(
                helpText,
                /Builds one package or all packages and writes artifacts to disk\./u
            );
            assert.match(helpText, /\[package\]/u);
            assert.match(helpText, /--all/u);
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
                'package-a',
                '--format',
                'rar',
                '--out',
                '/workspace/package-a.rar'
            ]);

            assert.strictEqual(exitCode, 1);
        });
    });

    suite('pack all command', function () {
        test('pack --all loads the config and forwards flags into packAllPackages', async function () {
            const loadConfiguration = fake.resolves('the-config');
            const packAllPackages = fake.resolves({
                result: Result.ok({ packageNames: [ 'package-a', 'package-b' ] })
            });
            const runner = createRunner({ loadConfiguration, packAllPackages });

            const exitCode = await runner.run([
                ...packAllFolderArguments(),
                '--version',
                '1.2.3',
                '--vendor-dependencies'
            ]);

            assert.strictEqual(exitCode, 0);
            assert.strictEqual(loadConfiguration.callCount, 1);
            assert.strictEqual(packAllPackages.callCount, 1);
            assert.strictEqual(packAllPackages.firstCall.args[0], 'the-config');
            assert.deepStrictEqual(packAllPackages.firstCall.args[1], {
                outputPath: '/workspace/packages',
                version: '1.2.3',
                vendorDependencies: true
            });
        });

        test('pack --all reports the packed package count and output root', async function () {
            const log = fake();
            const packAllPackages = fake.resolves({
                result: Result.ok({ packageNames: [ 'package-a', 'package-b' ] })
            });
            const runner = createRunner({ log, packAllPackages });

            const exitCode = await runner.run(packAllFolderArguments());

            assert.strictEqual(exitCode, 0);
            assert.match(String(log.firstCall.args[0]), /Packed 2 packages as folders to \/workspace\/packages/u);
        });

        test('pack --all rejects archive formats before loading the config', async function () {
            const loadConfiguration = fake.resolves('the-config');
            const log = fake();
            const runner = createRunner({ loadConfiguration, log });

            const exitCode = await runner.run(packAllArguments('zip', '/workspace/packages.zip'));

            assert.strictEqual(exitCode, 1);
            assert.strictEqual(loadConfiguration.callCount, 0);
            assert.match(String(log.firstCall.args[0]), /pack --all only supports --format folder/u);
        });

        test('pack rejects using --all together with a package argument before loading the config', async function () {
            const loadConfiguration = fake.resolves('the-config');
            const log = fake();
            const runner = createRunner({ loadConfiguration, log });

            const exitCode = await runner.run([
                'foo',
                'bar',
                'pack',
                'package-a',
                ...packAllFolderArguments().slice(3)
            ]);

            assert.strictEqual(exitCode, 1);
            assert.strictEqual(loadConfiguration.callCount, 0);
            assert.match(String(log.firstCall.args[0]), /Pass either --all or <package>, not both/u);
        });

        test('pack rejects a missing package argument without --all before loading the config', async function () {
            const loadConfiguration = fake.resolves('the-config');
            const log = fake();
            const runner = createRunner({ loadConfiguration, log });

            const exitCode = await runner.run([
                'foo',
                'bar',
                'pack',
                ...packAllFolderArguments().slice(4)
            ]);

            assert.strictEqual(exitCode, 1);
            assert.strictEqual(loadConfiguration.callCount, 0);
            assert.match(String(log.firstCall.args[0]), /Pass <package> or --all/u);
        });
    });

    suite('inspect dependencies command', function () {
        test('loads the config and forwards the package name to inspectPackageDependencies', async function () {
            const loadConfiguration = fake.resolves('the-config');
            const inspectPackageDependencies = fake.resolves({
                result: Result.ok({ packageName: 'package-a', dependencies: [] })
            });
            const runner = createRunner({ loadConfiguration, inspectPackageDependencies });

            const exitCode = await runner.run([ 'foo', 'bar', 'inspect', 'dependencies', 'package-a' ]);

            assert.strictEqual(exitCode, 0);
            assert.strictEqual(loadConfiguration.callCount, 1);
            assert.deepStrictEqual(inspectPackageDependencies.firstCall.args, [ 'the-config', 'package-a' ]);
        });

        test('returns exit code 1 when inspectPackageDependencies reports an Err', async function () {
            const inspectPackageDependencies = fake.resolves(
                { result: Result.err({ type: 'package-not-found', packageName: 'missing' }) }
            );
            const runner = createRunner({ inspectPackageDependencies });

            const exitCode = await runner.run([ 'foo', 'bar', 'inspect', 'dependencies', 'missing' ]);

            assert.strictEqual(exitCode, 1);
        });

        test('inspect dependencies --help advertises the package argument', async function () {
            const help = await expectHelp([ 'inspect', 'dependencies', '--help' ]);

            assert.match(help, /Prints why final manifest dependencies are emitted for one package\./u);
            assert.match(help, /<package>/u);
        });
    });

    suite('tree command', function () {
        test('tree command loads the config and forwards the package name to inspectPackageTree', async function () {
            const loadConfiguration = fake.resolves('the-config');
            const inspectPackageTree = fake.resolves({
                result: Result.ok({ packageName: 'package-a', entries: [] })
            });
            const runner = createRunner({ loadConfiguration, inspectPackageTree });

            const exitCode = await runner.run([ 'foo', 'bar', 'tree', 'package-a' ]);

            assert.strictEqual(exitCode, 0);
            assert.strictEqual(loadConfiguration.callCount, 1);
            assert.deepStrictEqual(inspectPackageTree.firstCall.args, [ 'the-config', 'package-a' ]);
        });

        test('tree command returns exit code 1 when inspectPackageTree reports an Err', async function () {
            const inspectPackageTree = fake.resolves(
                { result: Result.err({ type: 'package-not-found', packageName: 'missing' }) }
            );
            const runner = createRunner({ inspectPackageTree });

            const exitCode = await runner.run([ 'foo', 'bar', 'tree', 'missing' ]);

            assert.strictEqual(exitCode, 1);
        });

        test('tree --help advertises the command and positional package argument', async function () {
            const help = await expectHelp([ 'tree', '--help' ]);

            assert.match(help, /Prints the local artifact tree for a single configured package\./u);
            assert.match(help, /<package>/u);
        });

        test('tree command rejects a missing package argument', async function () {
            const log = fake();
            const runner = createRunner({ log });

            const exitCode = await runner.run([ 'foo', 'bar', 'tree' ]);

            assert.strictEqual(exitCode, 1);
        });
    });
});
