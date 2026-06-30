import assert from 'node:assert';
import { fake, type SinonSpy } from 'sinon';
import type { PublicPublishSettings } from '../../config/publish-settings.ts';
import type { PublishAuthStrategy } from '../../config/registry-settings.ts';
import { createFakeClock, type FakeClock } from '../../test-libraries/fake-clock.ts';
import { createRegistryClient, type RegistryClient, type RegistryClientDependencies } from './registry-client.ts';

type NpmFetchOverrides = {
    readonly buffer?: Readonly<SinonSpy>;
    readonly json?: Readonly<SinonSpy>;
};

type FetchSpyCall = {
    readonly args: readonly unknown[];
    readonly firstArg: unknown;
};

type FetchSpyAssertions = {
    readonly callCount: number;
    readonly firstCall: FetchSpyCall;
    readonly secondCall: FetchSpyCall;
};

export type FakeNpmFetch = FetchSpyAssertions & {
    (url: string, options?: unknown): Promise<{ readonly buffer: Readonly<SinonSpy>; }>;
    readonly json: Readonly<SinonSpy> & { readonly stream: Readonly<SinonSpy>; };
    readonly pickRegistry: Readonly<SinonSpy>;
};

function createFakeNpmFetch(overrides: NpmFetchOverrides = {}): FakeNpmFetch {
    const buffer = overrides.buffer ?? fake();
    const json = overrides.json ?? fake();
    const jsonWithStream = Object.assign(json, { stream: fake() });
    return Object.assign(fake.resolves({ buffer }), {
        json: jsonWithStream,
        pickRegistry: fake()
    });
}

type ResolveIdToken = (auth: Extract<PublishAuthStrategy, { readonly type: 'npm-oidc'; }>) => Promise<string>;

export type RegistryClientOverrides = {
    readonly publish?: SinonSpy;
    readonly npmFetchJson?: Readonly<SinonSpy>;
    readonly npmFetch?: FakeNpmFetch;
    readonly fetch?: typeof globalThis.fetch;
    readonly clock?: FakeClock;
    readonly resolveIdToken?: ResolveIdToken;
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
    Pick<RegistryClientOverrides, 'clock' | 'fetch' | 'npmFetchJson' | 'publish' | 'resolveIdToken'>
>;

function createDefaultOverrides(): DefaultRegistryClientOverrides {
    return {
        publish: fake(),
        npmFetchJson: fake(),
        fetch: createDefaultFetch(),
        clock: createFakeClock({ initialTimestamp: Date.parse('2026-05-06T10:00:00.000Z') }),
        resolveIdToken: fake.resolves('upstream-id-token')
    };
}

export function registryClientFactory(overrides: RegistryClientOverrides = {}): RegistryClient {
    const defaults = createDefaultOverrides();
    const resolved = { ...defaults, ...overrides };
    const npmFetch = overrides.npmFetch ?? createFakeNpmFetch({ json: resolved.npmFetchJson });

    const dependencies: RegistryClientDependencies = {
        publish: resolved.publish,
        npmFetch: npmFetch as unknown as RegistryClientDependencies['npmFetch'],
        fetch: resolved.fetch,
        clock: resolved.clock,
        resolveIdToken: resolved.resolveIdToken,
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

type OidcExchangeFetchOptions = {
    readonly ok?: boolean;
    readonly status?: number;
    readonly response?: unknown;
    readonly token?: string;
    readonly expires?: string;
};

type RegistrySettingsOptions = {
    readonly registryUrl?: string;
};

type PackageInfo = {
    readonly name: string;
    readonly version: string;
};

const packageInfo = { name: 'the-name', version: '1.0.0' } as const;
const bearerTokenAuth = { auth: { type: 'bearer-token', token: 'the-token' } } as const;

type LatestVersionResponse = {
    readonly name: '';
    readonly 'dist-tags': { readonly latest: '1'; };
    readonly versions: {
        readonly 1: { readonly dist: { readonly tarball: 'https://registry.example.test/pkg.tgz'; }; };
    };
};

export const metadataAutoBearerAuth = {
    publish: { type: 'bearer-token', token: 'writer-token' },
    metadata: 'auto'
} as const;

export function errorWithStatus(message: string, statusCode: number): Error {
    return Object.assign(new Error(message), { statusCode });
}

function latestVersionResponse(): LatestVersionResponse {
    return {
        name: '',
        'dist-tags': { latest: '1' },
        versions: { 1: { dist: { tarball: 'https://registry.example.test/pkg.tgz' } } }
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

type NpmOidcRegistrySettings = {
    readonly registryUrl?: string;
    readonly auth: {
        readonly publish: { readonly type: 'npm-oidc'; readonly provider: 'env'; };
        readonly metadata: 'anonymous';
    };
};

function createOidcExchangeResponse(options: OidcExchangeFetchOptions): unknown {
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

export function createOidcExchangeFetch(options: OidcExchangeFetchOptions = {}): typeof globalThis.fetch {
    const response = {
        ok: options.ok ?? true,
        status: options.status ?? 201,
        json: fake.resolves(createOidcExchangeResponse(options))
    } as unknown as Response;
    return fake.resolves(response);
}

export function requireFetchSpy(fetchFunction: typeof globalThis.fetch): SinonSpy {
    return fetchFunction as unknown as SinonSpy;
}

export function npmOidcRegistrySettings(options: RegistrySettingsOptions = {}): NpmOidcRegistrySettings {
    return {
        ...options.registryUrl !== undefined && { registryUrl: options.registryUrl },
        auth: {
            publish: { type: 'npm-oidc', provider: 'env' },
            metadata: 'anonymous'
        }
    } as const;
}

export async function publishWithNpmOidc(
    registryClient: RegistryClient,
    publishedPackageInfo: PackageInfo = { name: '@scope/the-name', version: '1.0.0' },
    settings: NpmOidcRegistrySettings = npmOidcRegistrySettings()
): Promise<void> {
    await registryClient.publishPackage(publishedPackageInfo, Buffer.from([]), settings, { access: 'public' }, false);
}

export async function publishWithBearerToken(
    registryClient: RegistryClient,
    publishSettings: PublicPublishSettings,
    stage: boolean
): Promise<unknown> {
    return registryClient.publishPackage(packageInfo, Buffer.from([]), bearerTokenAuth, publishSettings, stage);
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

export function buildLatestVersionFetchJson(): SinonSpy {
    return fake.resolves({
        name: '',
        'dist-tags': { latest: '1' },
        versions: { 1: { dist: { tarball: '' } } }
    });
}

export function buildStagedVersionsFetchJson(
    pages: readonly { readonly items: readonly { readonly version: string; }[]; readonly total: number; }[]
): SinonSpy {
    let callIndex = 0;
    return fake(async function () {
        const page = pages[callIndex] ?? pages.at(-1) ?? { items: [], total: 0 };
        callIndex += 1;
        return page;
    });
}
