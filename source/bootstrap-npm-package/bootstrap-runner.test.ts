import assert from 'node:assert';
import { suite, test } from 'mocha';
import { type BootstrapInput, type BootstrapRunnerDependencies, createBootstrapRunner } from './bootstrap-runner.ts';
import type { PackagePublication } from './package-publication.ts';
import type { PlaceholderTarballBuilder } from './placeholder-tarball.ts';

type PlaceholderTarballInput = Parameters<PlaceholderTarballBuilder['build']>[0];
type PublicationInput = Parameters<PackagePublication['publish']>[0];

type Recordings = {
    readonly placeholderInputs: PlaceholderTarballInput[];
    readonly publicationInputs: PublicationInput[];
    readonly logs: string[];
};

function createScenario(): { readonly recordings: Recordings; readonly dependencies: BootstrapRunnerDependencies } {
    const recordings: Recordings = {
        placeholderInputs: [],
        publicationInputs: [],
        logs: []
    };

    const placeholderTarballBuilder: PlaceholderTarballBuilder = {
        async build(input) {
            recordings.placeholderInputs.push(input);
            return Buffer.from(`tarball-for-${input.manifest.name}`);
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
        dependencies: { placeholderTarballBuilder, packagePublication, promptForOneTimePassword, log }
    };
}

function buildBootstrapInput(overrides: Partial<BootstrapInput> = {}): BootstrapInput {
    return {
        packageName: '@scope/example',
        registryUrl: 'https://registry.npmjs.org/',
        workaroundUrl: 'https://github.com/npm/cli/issues/8544',
        distTag: 'bootstrap',
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

    test('publishes the built tarball with the supplied dist-tag and registry', async function () {
        const scenario = createScenario();
        const runner = createBootstrapRunner(scenario.dependencies);

        await runner.run(buildBootstrapInput({ distTag: 'next-bootstrap', registryUrl: 'https://registry.example/' }));

        assert.strictEqual(scenario.recordings.publicationInputs.length, 1);
        const [publication] = scenario.recordings.publicationInputs;
        assert.ok(publication !== undefined);
        assert.strictEqual(publication.distTag, 'next-bootstrap');
        assert.strictEqual(publication.registryUrl, 'https://registry.example/');
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
