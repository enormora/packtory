import assert from 'node:assert';
import { suite, test } from 'mocha';
import { type BootstrapInput, type BootstrapRunnerDependencies, createBootstrapRunner } from './bootstrap-runner.ts';
import type { NpmrcTokenLookup } from './npmrc-token-lookup.ts';
import type { PackagePublication } from './package-publication.ts';
import type { PlaceholderTarballBuilder } from './placeholder-tarball.ts';
import type { WebLogin } from './web-login.ts';

type PlaceholderTarballInput = Parameters<PlaceholderTarballBuilder['build']>[0];
type PublicationInput = Parameters<PackagePublication['publish']>[0];
type WebLoginInput = Parameters<WebLogin['login']>[0];
type WebLoginResult = Awaited<ReturnType<WebLogin['login']>>;

type Recordings = {
    readonly placeholderInputs: PlaceholderTarballInput[];
    readonly loginInputs: WebLoginInput[];
    readonly publicationInputs: PublicationInput[];
    readonly logs: string[];
};

type ScenarioOverrides = {
    readonly loginResult?: WebLoginResult;
    readonly cachedNpmrcToken?: string;
};

function createScenario(overrides: ScenarioOverrides = {}): {
    readonly recordings: Recordings;
    readonly dependencies: BootstrapRunnerDependencies;
} {
    const loginResult = overrides.loginResult ?? { token: 'fresh-token', username: 'alice' };
    const { cachedNpmrcToken } = overrides;
    const recordings: Recordings = {
        placeholderInputs: [],
        loginInputs: [],
        publicationInputs: [],
        logs: []
    };

    const placeholderTarballBuilder: PlaceholderTarballBuilder = {
        async build(input) {
            recordings.placeholderInputs.push(input);
            return Buffer.from(`tarball-for-${input.manifest.name}`);
        }
    };
    const npmrcTokenLookup: NpmrcTokenLookup = {
        async findToken() {
            return cachedNpmrcToken;
        }
    };
    const webLogin: WebLogin = {
        async login(input) {
            recordings.loginInputs.push(input);
            return loginResult;
        }
    };
    const packagePublication: PackagePublication = {
        async publish(input) {
            recordings.publicationInputs.push(input);
        }
    };
    const log = (message: string): void => {
        recordings.logs.push(message);
    };
    const promptForOneTimePassword: BootstrapRunnerDependencies['promptForOneTimePassword'] = async () => {
        return 'scenario-otp';
    };

    return {
        recordings,
        dependencies: {
            placeholderTarballBuilder,
            npmrcTokenLookup,
            webLogin,
            packagePublication,
            promptForOneTimePassword,
            log
        }
    };
}

function buildBootstrapInput(overrides: Partial<BootstrapInput> = {}): BootstrapInput {
    return {
        packageName: '@scope/example',
        registryUrl: 'https://registry.npmjs.org/',
        workaroundUrl: 'https://github.com/npm/cli/issues/8544',
        distTag: 'bootstrap',
        hostname: 'workstation',
        ...overrides
    };
}

suite('bootstrap-runner', function () {
    test('builds the placeholder tarball with the supplied package name as version 0.0.1', async function () {
        const scenario = createScenario();
        const runner = createBootstrapRunner(scenario.dependencies);

        await runner.run(buildBootstrapInput());

        assert.strictEqual(scenario.recordings.placeholderInputs.length, 1);
        const [placeholderInput] = scenario.recordings.placeholderInputs;
        assert.ok(placeholderInput !== undefined);
        assert.strictEqual(placeholderInput.manifest.name, '@scope/example');
        assert.strictEqual(placeholderInput.manifest.version, '0.0.1');
        assert.strictEqual(placeholderInput.manifest.license, 'MIT');
    });

    test('includes a deprecated message in the placeholder manifest referencing the workaround URL', async function () {
        const scenario = createScenario();
        const runner = createBootstrapRunner(scenario.dependencies);

        await runner.run(buildBootstrapInput({ workaroundUrl: 'https://example.test/workaround' }));

        const [placeholderInput] = scenario.recordings.placeholderInputs;
        assert.ok(placeholderInput !== undefined);
        assert.ok(placeholderInput.manifest.deprecated.includes('https://example.test/workaround'));
    });

    test('mentions the workaround URL in the placeholder description and readme', async function () {
        const scenario = createScenario();
        const runner = createBootstrapRunner(scenario.dependencies);

        await runner.run(buildBootstrapInput({ workaroundUrl: 'https://example.test/workaround' }));

        const [placeholderInput] = scenario.recordings.placeholderInputs;
        assert.ok(placeholderInput !== undefined);
        assert.ok(placeholderInput.manifest.description.includes('https://example.test/workaround'));
        assert.ok(placeholderInput.readmeContent.includes('https://example.test/workaround'));
    });

    test('opens the web login flow with the registry URL and the supplied hostname', async function () {
        const scenario = createScenario();
        const runner = createBootstrapRunner(scenario.dependencies);

        await runner.run(buildBootstrapInput({ registryUrl: 'https://registry.example/', hostname: 'desktop-1' }));

        assert.deepStrictEqual(scenario.recordings.loginInputs, [
            { registryUrl: 'https://registry.example/', hostname: 'desktop-1' }
        ]);
    });

    test('publishes the built tarball with the supplied dist-tag and the token from the web session', async function () {
        const scenario = createScenario({ loginResult: { token: 'session-token', username: 'alice' } });
        const runner = createBootstrapRunner(scenario.dependencies);

        await runner.run(buildBootstrapInput({ distTag: 'next-bootstrap' }));

        assert.strictEqual(scenario.recordings.publicationInputs.length, 1);
        const [publication] = scenario.recordings.publicationInputs;
        assert.ok(publication !== undefined);
        assert.strictEqual(publication.distTag, 'next-bootstrap');
        assert.strictEqual(publication.token, 'session-token');
        assert.strictEqual(publication.manifest.name, '@scope/example');
        assert.deepStrictEqual(publication.tarball, Buffer.from('tarball-for-@scope/example'));
    });

    test('logs the Trusted Publisher URL for the new package at the end of a successful run', async function () {
        const scenario = createScenario();
        const runner = createBootstrapRunner(scenario.dependencies);

        await runner.run(buildBootstrapInput());

        const lastLog = scenario.recordings.logs.at(-1);
        assert.ok(lastLog !== undefined);
        assert.strictEqual(
            lastLog,
            'Done. Configure the Trusted Publisher at https://www.npmjs.com/package/@scope/example/access'
        );
    });

    test('reuses an existing token from `~/.npmrc` and does not open the browser login flow', async function () {
        const scenario = createScenario({ cachedNpmrcToken: 'cached-token' });
        const runner = createBootstrapRunner(scenario.dependencies);

        await runner.run(buildBootstrapInput());

        assert.strictEqual(scenario.recordings.loginInputs.length, 0);
        const [publication] = scenario.recordings.publicationInputs;
        assert.ok(publication !== undefined);
        assert.strictEqual(publication.token, 'cached-token');
    });

    test('falls back to web login when no token is cached in `~/.npmrc`', async function () {
        const scenario = createScenario({ loginResult: { token: 'fresh-token', username: 'alice' } });
        const runner = createBootstrapRunner(scenario.dependencies);

        await runner.run(buildBootstrapInput());

        assert.strictEqual(scenario.recordings.loginInputs.length, 1);
        const [publication] = scenario.recordings.publicationInputs;
        assert.ok(publication !== undefined);
        assert.strictEqual(publication.token, 'fresh-token');
    });

    test('threads the one-time-password prompt through to the publication step', async function () {
        const scenario = createScenario();
        const promptForOneTimePassword: BootstrapRunnerDependencies['promptForOneTimePassword'] = async () => {
            return 'wired-otp';
        };
        const runner = createBootstrapRunner({
            ...scenario.dependencies,
            promptForOneTimePassword
        });

        await runner.run(buildBootstrapInput());

        const [publication] = scenario.recordings.publicationInputs;
        assert.ok(publication !== undefined);
        assert.strictEqual(publication.promptForOneTimePassword, promptForOneTimePassword);
    });

    test('falls back to "Authenticated to npm" when the web login does not report a username', async function () {
        const scenario = createScenario({ loginResult: { token: 'tk', username: undefined } });
        const runner = createBootstrapRunner(scenario.dependencies);

        await runner.run(buildBootstrapInput());

        assert.ok(scenario.recordings.logs.includes('Authenticated to npm'));
    });

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
