type OneTimePasswordPrompt = () => Promise<string>;

type VersionDeprecationInput = {
    readonly packageName: string;
    readonly version: string;
    readonly message: string;
    readonly token: string;
    readonly registryUrl: string;
    readonly promptForOneTimePassword: OneTimePasswordPrompt;
};

type NpmRegistryFetchOptions = {
    readonly registry: string;
    readonly forceAuth: { readonly token: string };
    readonly otpPrompt?: OneTimePasswordPrompt;
    readonly method?: 'PUT';
    readonly body?: Readonly<Record<string, unknown>>;
};

type RegistryFetchJsonFunction = (
    path: string,
    options: NpmRegistryFetchOptions
) => Promise<Readonly<Record<string, unknown>>>;

type RegistryFetchFunction = (path: string, options: NpmRegistryFetchOptions) => Promise<unknown>;

export type VersionDeprecationDependencies = {
    readonly fetchJson: RegistryFetchJsonFunction;
    readonly registryFetch: RegistryFetchFunction;
};

export type VersionDeprecation = {
    readonly deprecate: (input: VersionDeprecationInput) => Promise<void>;
};

function encodePackageNameForPath(packageName: string): string {
    return packageName.replace('/', '%2F');
}

function isVersionMap(value: unknown): value is Record<string, Record<string, unknown>> {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    return Object.values(value).every((entry) => {
        return typeof entry === 'object' && entry !== null;
    });
}

function withDeprecatedVersion(
    packument: Readonly<Record<string, unknown>>,
    version: string,
    message: string
): Readonly<Record<string, unknown>> {
    const versionsValue = packument.versions;
    if (!isVersionMap(versionsValue)) {
        throw new Error('Cannot deprecate version: registry packument has no "versions" object');
    }

    const versionEntry = versionsValue[version];
    if (versionEntry === undefined) {
        throw new Error(`Cannot deprecate version: version "${version}" is not present in the packument`);
    }

    return {
        ...packument,
        versions: {
            ...versionsValue,
            [version]: { ...versionEntry, deprecated: message }
        }
    };
}

export function createVersionDeprecation(dependencies: Readonly<VersionDeprecationDependencies>): VersionDeprecation {
    const { fetchJson, registryFetch } = dependencies;

    return {
        async deprecate(input) {
            const path = `/${encodePackageNameForPath(input.packageName)}`;
            const baseOptions = {
                registry: input.registryUrl,
                forceAuth: { token: input.token },
                otpPrompt: input.promptForOneTimePassword
            };
            const packument = await fetchJson(path, baseOptions);
            const updated = withDeprecatedVersion(packument, input.version, input.message);
            await registryFetch(path, { ...baseOptions, method: 'PUT', body: updated });
        }
    };
}
