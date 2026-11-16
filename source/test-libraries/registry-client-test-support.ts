import assert from 'node:assert';
import { fake, type SinonSpy } from 'sinon';
import type { PublicPublishSettings } from '../configuration/publish-settings.ts';
import type { PublishAuthenticationStrategy } from '../configuration/registry-settings.ts';
import {
    createRegistryClient,
    type RegistryClient,
    type RegistryClientDependencies
} from '../bundle-emitter/registry/registry-client.ts';
import { createFakeClock, type FakeClock } from './fake-clock.ts';

type NpmFetchOverrides = {
    readonly buffer?: Readonly<SinonSpy>;
    readonly javaScriptObjectNotation?: Readonly<SinonSpy>;
};

type FetchSpyAssertions = Readonly<Pick<SinonSpy, 'callCount' | 'firstCall' | 'secondCall'>>;

type FakeNpmFetch = FetchSpyAssertions & {
    (address: string, options?: unknown): Promise<{ readonly buffer: Readonly<SinonSpy>; }>;
    readonly javaScriptObjectNotation: Readonly<SinonSpy> & { readonly stream: Readonly<SinonSpy>; };
    readonly pickRegistry: Readonly<SinonSpy>;
};

function createFakeNpmFetch(overrides: NpmFetchOverrides = {}): FakeNpmFetch {
    const buffer = overrides.buffer ?? fake();
    const javaScriptObjectNotation = overrides.javaScriptObjectNotation ?? fake();
    const javaScriptObjectNotationWithStream = Object.assign(javaScriptObjectNotation, { stream: fake() });
    return Object.assign(fake.resolves({ buffer }), {
        javaScriptObjectNotation: javaScriptObjectNotationWithStream,
        pickRegistry: fake()
    });
}

type ResolveIdentifierToken = (
    authentication: Extract<PublishAuthenticationStrategy, { readonly type: 'npm-open-identity-connect'; }>
) => Promise<string>;

export type RegistryClientOverrides = {
    readonly publish?: SinonSpy;
    readonly npmFetchJavaScriptObjectNotation?: Readonly<SinonSpy>;
    readonly npmFetch?: FakeNpmFetch;
    readonly fetch?: typeof globalThis.fetch;
    readonly clock?: FakeClock;
    readonly resolveIdentifierToken?: ResolveIdentifierToken;
    readonly promptForOneTimePassword?: () => Promise<string | undefined>;
};

function createDefaultFetch(): typeof globalThis.fetch {
    return fake.resolves(Response.json({
        token_type: 'oidc',
        token: 'oidc-exchange-token',
        created: '2026-05-06T10:00:00.000Z',
        expires: '2026-05-06T11:00:00.000Z'
    }, { status: 201 }));
}

type DefaultRegistryClientOverrides = Required<
    Pick<
        RegistryClientOverrides,
        'clock' | 'fetch' | 'npmFetchJavaScriptObjectNotation' | 'publish' | 'resolveIdentifierToken'
    >
>;

function createDefaultOverrides(): DefaultRegistryClientOverrides {
    return {
        publish: fake(),
        npmFetchJavaScriptObjectNotation: fake(),
        fetch: createDefaultFetch(),
        clock: createFakeClock({ initialTimestamp: Date.parse('2026-05-06T10:00:00.000Z') }),
        resolveIdentifierToken: fake.resolves('upstream-id-token')
    };
}

export function registryClientFactory(overrides: RegistryClientOverrides = {}): RegistryClient {
    const defaults = createDefaultOverrides();
    const resolved = { ...defaults, ...overrides };
    const npmFetch = overrides.npmFetch ??
        createFakeNpmFetch({ javaScriptObjectNotation: resolved.npmFetchJavaScriptObjectNotation });

    const dependencies: RegistryClientDependencies = {
        publish: resolved.publish,
        npmFetch: npmFetch as unknown as RegistryClientDependencies['npmFetch'],
        fetch: resolved.fetch,
        clock: resolved.clock,
        resolveIdentifierToken: resolved.resolveIdentifierToken,
        promptForOneTimePassword: overrides.promptForOneTimePassword
    };
    return createRegistryClient(dependencies);
}

type PublishedTokenOptions = {
    readonly forceAuth: {
        readonly token: string;
    };
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === 'object' && value !== null;
}

function hasPublishedTokenOptions(value: unknown): value is PublishedTokenOptions {
    if (!isRecord(value) || !isRecord(value.forceAuth)) {
        return false;
    }
    return typeof value.forceAuth.token === 'string';
}

type OpenIdentityConnectExchangeFetchOptions = {
    readonly ok?: boolean;
    readonly status?: number;
    readonly response?: unknown;
    readonly token?: string;
    readonly expires?: string;
};

type RegistrySettingsOptions = {
    readonly registryAddress?: string;
};

type PackageInformation = {
    readonly name: string;
    readonly version: string;
};

const packageInformation = { name: 'the-name', version: '1.0.0' } as const;
const bearerTokenAuthentication = { authentication: { type: 'bearer-token', token: 'the-token' } } as const;
const emptyTarballIntegrity = { integrity: undefined, shasum: undefined } as const;

type LatestVersionResponse = {
    readonly name: '';
    readonly 'dist-tags': { readonly latest: '1'; };
    readonly versions: {
        readonly 1: {
            readonly dist: {
                readonly tarball: 'https://registry.example.test/pkg.tgz';
                readonly integrity: string | undefined;
                readonly shasum: string | undefined;
            };
        };
    };
};

export const metadataAutomaticBearerAuthentication = {
    publish: { type: 'bearer-token', token: 'writer-token' },
    metadata: 'automatic'
} as const;

export function errorWithStatus(message: string, statusCode: number): Error {
    return Object.assign(new Error(message), { statusCode });
}

function latestVersionResponse(): LatestVersionResponse {
    return {
        name: '',
        'dist-tags': { latest: '1' },
        versions: { 1: { dist: { tarball: 'https://registry.example.test/pkg.tgz', ...emptyTarballIntegrity } } }
    };
}

export function createRetryingMetadataFetch(statusCode: number): SinonSpy {
    const error = errorWithStatus('auth required', statusCode);
    let callCount = 0;
    return fake(async function () {
        callCount += 1;
        if (callCount === 1) {
            throw error;
        }
        return latestVersionResponse();
    });
}

type NpmOpenIdentityConnectRegistrySettings = {
    readonly registryAddress?: string;
    readonly authentication: {
        readonly publish: { readonly type: 'npm-open-identity-connect'; readonly provider: 'environment'; };
        readonly metadata: 'anonymous';
    };
};

function createOpenIdentityConnectExchangeResponse(options: OpenIdentityConnectExchangeFetchOptions): unknown {
    if (Object.hasOwn(options, 'response')) {
        return options.response;
    }
    return {
        token_type: 'oidc',
        token: options.token ?? 'oidc-exchange-token',
        created: '2026-05-06T10:00:00.000Z',
        expires: options.expires ?? '2026-05-06T11:00:00.000Z'
    };
}

export function createOpenIdentityConnectExchangeFetch(
    options: OpenIdentityConnectExchangeFetchOptions = {}
): typeof globalThis.fetch {
    const response = {
        ok: options.ok ?? true,
        status: options.status ?? 201,
        json: fake.resolves(createOpenIdentityConnectExchangeResponse(options))
    } as unknown as Response;
    return fake.resolves(response);
}

export function requireFetchSpy(fetchFunction: typeof globalThis.fetch): SinonSpy {
    return fetchFunction as unknown as SinonSpy;
}

export function npmOpenIdentityConnectRegistrySettings(
    options: RegistrySettingsOptions = {}
): NpmOpenIdentityConnectRegistrySettings {
    return {
        ...options.registryAddress === undefined ? {} : { registryAddress: options.registryAddress },
        authentication: {
            publish: { type: 'npm-open-identity-connect', provider: 'environment' },
            metadata: 'anonymous'
        }
    } as const;
}

export async function publishWithNpmOpenIdentityConnect(
    registryClient: RegistryClient,
    publishedPackageInformation: PackageInformation = { name: '@scope/the-name', version: '1.0.0' },
    settings: NpmOpenIdentityConnectRegistrySettings = npmOpenIdentityConnectRegistrySettings()
): Promise<void> {
    await registryClient.publishPackage(
        publishedPackageInformation,
        Buffer.from([]),
        settings,
        { access: 'public' },
        false
    );
}

export async function publishWithBearerToken(
    registryClient: RegistryClient,
    publishSettings: PublicPublishSettings,
    stage: boolean
): Promise<unknown> {
    return registryClient.publishPackage(
        packageInformation,
        Buffer.from([]),
        bearerTokenAuthentication,
        publishSettings,
        stage
    );
}

export function getPublishedToken(publish: SinonSpy, callIndex = 0): string {
    const publishOptions: unknown = publish.getCall(callIndex).lastArg;
    if (!hasPublishedTokenOptions(publishOptions)) {
        assert.fail('Expected publish options to include a forceAuth token');
    }
    return publishOptions.forceAuth.token;
}

export async function expectFailure(action: () => Promise<unknown>, expectedError: RegExp): Promise<void> {
    try {
        await action();
        throw new Error('Expected the action to throw an error');
    } catch (error: unknown) {
        if (String(error) === 'Error: Expected the action to throw an error') {
            throw error;
        }
        assert.match(String(error), expectedError);
    }
}

export function buildLatestVersionFetchJavaScriptObjectNotation(): SinonSpy {
    return fake.resolves({
        name: '',
        'dist-tags': { latest: '1' },
        versions: { 1: { dist: { tarball: '' } } }
    });
}

export function buildStagedVersionsFetchJavaScriptObjectNotation(
    pages: readonly { readonly items: readonly { readonly version: string; }[]; readonly total: number; }[]
): SinonSpy {
    let callIndex = 0;
    return fake(async function () {
        const page = pages[callIndex] ?? pages.at(-1) ?? { items: [], total: 0 };
        callIndex += 1;
        return page;
    });
}
