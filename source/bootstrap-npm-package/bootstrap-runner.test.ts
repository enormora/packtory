import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { type BootstrapInput, type BootstrapRunnerDependencies, createBootstrapRunner } from './bootstrap-runner.ts';
import type { PackagePublication } from './package-publication.ts';
import type { PlaceholderTarballBuilder } from './placeholder-tarball.ts';
import type { WebLogin } from './web-login.ts';

type PlaceholderTarballInput = Parameters<PlaceholderTarballBuilder['build']>[0];
type PublicationInput = Parameters<PackagePublication['publish']>[0];
type WebLoginInput = Parameters<WebLogin['login']>[0];
type WebLoginResult = Awaited<ReturnType<WebLogin['login']>>;

type Recordings = {
    readonly placeholderInputs: readonly PlaceholderTarballInput[];
    readonly loginInputs: readonly WebLoginInput[];
    readonly publicationInputs: readonly PublicationInput[];
    readonly logs: readonly string[];
};

type Scenario = {
    readonly recordings: Recordings;
    readonly dependencies: BootstrapRunnerDependencies;
};

type ScenarioRecorder = {
    readonly recordings: Recordings;
    readonly recordPlaceholderInput: (input: PlaceholderTarballInput) => void;
    readonly recordLoginInput: (input: WebLoginInput) => void;
    readonly recordPublicationInput: (input: PublicationInput) => void;
    readonly recordLog: (message: string) => void;
};

function createScenarioDependencies(
    recorder: ScenarioRecorder,
    loginResult: WebLoginResult
): BootstrapRunnerDependencies {
    const placeholderTarballBuilder: PlaceholderTarballBuilder = {
        async build(input) {
            recorder.recordPlaceholderInput(input);
            return Buffer.from(`tarball-for-${input.manifest.name}`);
        }
    };
    const webLogin: WebLogin = {
        async login(input) {
            recorder.recordLoginInput(input);
            return loginResult;
        }
    };
    const packagePublication: PackagePublication = {
        async publish(input) {
            recorder.recordPublicationInput(input);
        }
    };
    const log = function (message: string): void {
        recorder.recordLog(message);
    };
    const promptForOneTimePassword: BootstrapRunnerDependencies['promptForOneTimePassword'] = async function () {
        return 'scenario-otp';
    };

    return { placeholderTarballBuilder, webLogin, packagePublication, promptForOneTimePassword, log };
}

function createScenarioRecorder(): ScenarioRecorder {
    let placeholderInputs: readonly PlaceholderTarballInput[] = [];
    let loginInputs: readonly WebLoginInput[] = [];
    let publicationInputs: readonly PublicationInput[] = [];
    let logs: readonly string[] = [];

    return {
        recordings: {
            get placeholderInputs() {
                return placeholderInputs;
            },
            get loginInputs() {
                return loginInputs;
            },
            get publicationInputs() {
                return publicationInputs;
            },
            get logs() {
                return logs;
            }
        },
        recordPlaceholderInput(input) {
            placeholderInputs = [ ...placeholderInputs, input ];
        },
        recordLoginInput(input) {
            loginInputs = [ ...loginInputs, input ];
        },
        recordPublicationInput(input) {
            publicationInputs = [ ...publicationInputs, input ];
        },
        recordLog(message) {
            logs = [ ...logs, message ];
        }
    };
}

function createScenario(loginResult: WebLoginResult = { token: 'fresh-token', username: 'alice' }): Scenario {
    const recorder = createScenarioRecorder();
    return {
        recordings: recorder.recordings,
        dependencies: createScenarioDependencies(recorder, loginResult)
    };
}

function buildBootstrapInput(overrides: Partial<BootstrapInput> = {}): BootstrapInput {
    return {
        packageName: '@scope/example',
        hostname: 'workstation',
        ...overrides
    };
}

function assertPlaceholderManifest(placeholderInput: PlaceholderTarballInput | undefined): void {
    assertDefined(placeholderInput);
    assert.partialDeepStrictEqual(placeholderInput, {
        manifest: {
            name: '@scope/example',
            version: '0.0.1',
            license: 'MIT'
        }
    });
}

function assertPublicationInput(publication: PublicationInput | undefined): void {
    assertDefined(publication);
    assert.partialDeepStrictEqual(publication, {
        distTag: 'bootstrap',
        registryUrl: 'https://registry.npmjs.org/',
        token: 'session-token',
        manifest: {
            name: '@scope/example'
        },
        tarball: Buffer.from('tarball-for-@scope/example')
    });
}

suite('bootstrap-runner', function () {
    suite('flow', function () {
        test('builds the placeholder tarball with the supplied package name as version 0.0.1', async function () {
            const scenario = createScenario();
            const runner = createBootstrapRunner(scenario.dependencies);

            await runner.run(buildBootstrapInput());

            assert.strictEqual(scenario.recordings.placeholderInputs.length, 1);
            const [ placeholderInput ] = scenario.recordings.placeholderInputs;
            assertPlaceholderManifest(placeholderInput);
        });

        test('opens the web login flow with the hardcoded npmjs.org registry and the supplied hostname', async function () {
            const scenario = createScenario();
            const runner = createBootstrapRunner(scenario.dependencies);

            await runner.run(buildBootstrapInput({ hostname: 'desktop-1' }));

            assert.deepStrictEqual(scenario.recordings.loginInputs, [
                { registryUrl: 'https://registry.npmjs.org/', hostname: 'desktop-1' }
            ]);
        });

        test('publishes the built tarball with the hardcoded dist-tag, registry and the token from the web session', async function () {
            const scenario = createScenario({ token: 'session-token', username: 'alice' });
            const runner = createBootstrapRunner(scenario.dependencies);

            await runner.run(buildBootstrapInput());

            assert.strictEqual(scenario.recordings.publicationInputs.length, 1);
            const [ publication ] = scenario.recordings.publicationInputs;
            assertPublicationInput(publication);
        });

        test('logs the Trusted Publisher URL for the new package at the end of a successful run', async function () {
            const scenario = createScenario();
            const runner = createBootstrapRunner(scenario.dependencies);

            await runner.run(buildBootstrapInput());

            const lastLog = scenario.recordings.logs.at(-1);
            assertDefined(lastLog);
            assert.strictEqual(
                lastLog,
                'Done. Configure the Trusted Publisher at https://www.npmjs.com/package/@scope/example/access'
            );
        });

        test('threads the one-time-password prompt through to the publication step', async function () {
            const scenario = createScenario();
            const promptForOneTimePassword: BootstrapRunnerDependencies['promptForOneTimePassword'] =
                async function () {
                    return 'wired-otp';
                };
            const runner = createBootstrapRunner({
                ...scenario.dependencies,
                promptForOneTimePassword
            });

            await runner.run(buildBootstrapInput());

            const [ publication ] = scenario.recordings.publicationInputs;
            assertDefined(publication);
            assert.strictEqual(publication.promptForOneTimePassword, promptForOneTimePassword);
        });
    });

    suite('messages', function () {
        test('produces the expected manifest description verbatim from the package name and the hardcoded workaround URL', async function () {
            const scenario = createScenario();
            const runner = createBootstrapRunner(scenario.dependencies);

            await runner.run(buildBootstrapInput({ packageName: '@scope/foo' }));

            const [ placeholderInput ] = scenario.recordings.placeholderInputs;
            assertDefined(placeholderInput);
            const expectedDescription =
                'Placeholder claiming the npm package name "@scope/foo" so a trusted publisher ' +
                'can be configured. See https://github.com/npm/cli/issues/8544.';
            assert.strictEqual(placeholderInput.manifest.description, expectedDescription);
        });

        test('produces the expected deprecated message verbatim using the hardcoded workaround URL', async function () {
            const scenario = createScenario();
            const runner = createBootstrapRunner(scenario.dependencies);

            await runner.run(buildBootstrapInput());

            const [ placeholderInput ] = scenario.recordings.placeholderInputs;
            assertDefined(placeholderInput);
            const expectedDeprecation =
                'Placeholder published as a workaround so a Trusted Publisher could be configured. ' +
                'See https://github.com/npm/cli/issues/8544.';
            assert.strictEqual(placeholderInput.manifest.deprecated, expectedDeprecation);
        });

        test('produces the expected readme content verbatim from the package name and the hardcoded workaround URL', async function () {
            const scenario = createScenario();
            const runner = createBootstrapRunner(scenario.dependencies);

            await runner.run(buildBootstrapInput({ packageName: '@scope/foo' }));

            const expectedReadme = [
                '# @scope/foo',
                '',
                'This version is a placeholder published only to claim the npm name `@scope/foo` so a Trusted Publisher',
                'can subsequently be configured for it. It contains no real package content and is published already',
                'deprecated.',
                '',
                'Workaround context: https://github.com/npm/cli/issues/8544',
                ''
            ]
                .join('\n');
            const [ placeholderInput ] = scenario.recordings.placeholderInputs;
            assertDefined(placeholderInput);
            assert.strictEqual(placeholderInput.readmeContent, expectedReadme);
        });

        test('logs the placeholder-tarball build step verbatim', async function () {
            const scenario = createScenario();
            const runner = createBootstrapRunner(scenario.dependencies);

            await runner.run(buildBootstrapInput({ packageName: '@scope/foo' }));

            assert.ok(scenario.recordings.logs.includes('Building placeholder tarball for @scope/foo@0.0.1'));
        });

        test('logs the publish step verbatim including the package name, version and the hardcoded dist-tag', async function () {
            const scenario = createScenario();
            const runner = createBootstrapRunner(scenario.dependencies);

            await runner.run(buildBootstrapInput({ packageName: '@scope/foo' }));

            assert.ok(
                scenario.recordings.logs.includes(
                    'Publishing @scope/foo@0.0.1 (already deprecated) under dist-tag bootstrap'
                )
            );
        });

        test('logs the "Opening browser for npm web login" line verbatim before invoking the web login', async function () {
            const scenario = createScenario();
            const runner = createBootstrapRunner(scenario.dependencies);

            await runner.run(buildBootstrapInput());

            assert.ok(scenario.recordings.logs.includes('Opening browser for npm web login'));
        });

        test('builds the authenticated-as message with the username when one is returned by web login', async function () {
            const scenario = createScenario({ token: 'tk', username: 'alice' });
            const runner = createBootstrapRunner(scenario.dependencies);

            await runner.run(buildBootstrapInput());

            assert.ok(scenario.recordings.logs.includes('Authenticated to npm as alice'));
        });

        test('falls back to "Authenticated to npm" when the web login does not report a username', async function () {
            const scenario = createScenario({ token: 'tk', username: undefined });
            const runner = createBootstrapRunner(scenario.dependencies);

            await runner.run(buildBootstrapInput());

            assert.ok(scenario.recordings.logs.includes('Authenticated to npm'));
        });

        test('falls back to "Authenticated to npm" when the web login reports an empty-string username', async function () {
            const scenario = createScenario({ token: 'tk', username: '' });
            const runner = createBootstrapRunner(scenario.dependencies);

            await runner.run(buildBootstrapInput());

            assert.ok(scenario.recordings.logs.includes('Authenticated to npm'));
            assert.strictEqual(
                scenario.recordings.logs.some(function (line) {
                    return line.startsWith('Authenticated to npm as');
                }),
                false
            );
        });
    });

    suite('errors', function () {
        test('propagates errors from the publication step', async function () {
            const scenario = createScenario();
            const runner = createBootstrapRunner({
                ...scenario.dependencies,
                packagePublication: {
                    async publish() {
                        throw new Error('npm registry returned 403');
                    }
                }
            });

            try {
                await runner.run(buildBootstrapInput());
                assert.fail('expected run to throw');
            } catch (error: unknown) {
                assert.ok(error instanceof Error);
                assert.strictEqual(error.message, 'npm registry returned 403');
            }
        });
    });
});
