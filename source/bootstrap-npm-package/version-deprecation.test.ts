// cspell:words Fexample

import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    createVersionDeprecation,
    type VersionDeprecation,
    type VersionDeprecationDependencies
} from './version-deprecation.ts';

type RegistryFetchJsonFunction = VersionDeprecationDependencies['fetchJson'];
type RegistryFetchFunction = VersionDeprecationDependencies['registryFetch'];
type VersionDeprecationInput = Parameters<VersionDeprecation['deprecate']>[0];

type FetchCall = {
    readonly path: string;
    readonly method?: 'PUT';
    readonly registry: string;
    readonly token: string;
    readonly body?: Readonly<Record<string, unknown>>;
};

function createFetcher(packumentByPath: Readonly<Record<string, Readonly<Record<string, unknown>>>>): {
    readonly fetchJson: RegistryFetchJsonFunction;
    readonly registryFetch: RegistryFetchFunction;
    readonly calls: readonly FetchCall[];
} {
    const calls: FetchCall[] = [];
    const fetchJson: RegistryFetchJsonFunction = async (path, options) => {
        calls.push({ path, registry: options.registry, token: options.forceAuth.token });
        const packument = packumentByPath[path];
        if (packument === undefined) {
            throw new Error(`No packument fixture for path ${path}`);
        }
        return packument;
    };
    const registryFetch: RegistryFetchFunction = async (path, options) => {
        const baseCall = { path, registry: options.registry, token: options.forceAuth.token };
        const withMethod = options.method === undefined ? baseCall : { ...baseCall, method: options.method };
        const withBody = options.body === undefined ? withMethod : { ...withMethod, body: options.body };
        calls.push(withBody);
        return undefined;
    };
    return { fetchJson, registryFetch, calls };
}

function createScenario(packumentByPath: Readonly<Record<string, Readonly<Record<string, unknown>>>>): {
    readonly fetcher: ReturnType<typeof createFetcher>;
    readonly deprecation: VersionDeprecation;
} {
    const fetcher = createFetcher(packumentByPath);
    const deprecation = createVersionDeprecation({
        fetchJson: fetcher.fetchJson,
        registryFetch: fetcher.registryFetch
    });
    return { fetcher, deprecation };
}

function buildInput(overrides: Partial<VersionDeprecationInput> = {}): VersionDeprecationInput {
    return {
        packageName: '@scope/example',
        version: '0.0.1',
        message: 'placeholder',
        token: 'bearer',
        registryUrl: 'https://registry.npmjs.org/',
        ...overrides
    };
}

const scopeExamplePath = '/@scope%2Fexample';

suite('version-deprecation', function () {
    test('GETs the packument at the URL-encoded package path with token auth', async function () {
        const { fetcher, deprecation } = createScenario({
            [scopeExamplePath]: {
                name: '@scope/example',
                versions: { '0.0.1': { name: '@scope/example', version: '0.0.1' } }
            }
        });

        await deprecation.deprecate(buildInput());

        assert.deepStrictEqual(fetcher.calls[0], {
            path: scopeExamplePath,
            registry: 'https://registry.npmjs.org/',
            token: 'bearer'
        });
    });

    test('PUTs the packument back with the deprecated message attached to the target version', async function () {
        const { fetcher, deprecation } = createScenario({
            [scopeExamplePath]: {
                name: '@scope/example',
                versions: {
                    '0.0.1': { name: '@scope/example', version: '0.0.1', description: 'placeholder' }
                }
            }
        });

        await deprecation.deprecate(buildInput({ message: 'workaround for npm/cli#8544' }));

        const putCall = fetcher.calls.find((call) => {
            return call.method === 'PUT';
        });
        assert.ok(putCall !== undefined, 'expected a PUT call');
        assert.deepStrictEqual(putCall.body, {
            name: '@scope/example',
            versions: {
                '0.0.1': {
                    name: '@scope/example',
                    version: '0.0.1',
                    description: 'placeholder',
                    deprecated: 'workaround for npm/cli#8544'
                }
            }
        });
    });

    test('throws when the packument is missing the "versions" object', async function () {
        const { deprecation } = createScenario({ [scopeExamplePath]: { name: '@scope/example' } });

        try {
            await deprecation.deprecate(buildInput());
            assert.fail('expected deprecate to throw');
        } catch (error: unknown) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'Cannot deprecate version: registry packument has no "versions" object');
        }
    });

    test('throws when the requested version is not present in the packument', async function () {
        const { deprecation } = createScenario({
            [scopeExamplePath]: {
                name: '@scope/example',
                versions: { '0.0.2': { name: '@scope/example', version: '0.0.2' } }
            }
        });

        try {
            await deprecation.deprecate(buildInput());
            assert.fail('expected deprecate to throw');
        } catch (error: unknown) {
            assert.ok(error instanceof Error);
            assert.strictEqual(
                error.message,
                'Cannot deprecate version: version "0.0.1" is not present in the packument'
            );
        }
    });

    test('encodes the scope slash in the request path so the registry routes correctly', async function () {
        const { fetcher, deprecation } = createScenario({
            [scopeExamplePath]: {
                name: '@scope/example',
                versions: { '0.0.1': { name: '@scope/example', version: '0.0.1' } }
            }
        });

        await deprecation.deprecate(buildInput());

        for (const call of fetcher.calls) {
            assert.strictEqual(call.path, scopeExamplePath);
        }
    });
});
