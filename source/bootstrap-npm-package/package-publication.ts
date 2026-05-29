export type PublicationManifest = {
    readonly name: string;
    readonly version: string;
    readonly description: string;
    readonly license: string;
    readonly deprecated: string;
};

export type WebOtpUrls = {
    readonly authUrl: string;
    readonly doneUrl: string;
};

type OneTimePasswordPrompt = (webOtpUrls: WebOtpUrls | undefined) => Promise<string>;

type PublicationInput = {
    readonly manifest: PublicationManifest;
    readonly tarball: Buffer;
    readonly registryUrl: string;
    readonly distTag: string;
    readonly promptForOneTimePassword: OneTimePasswordPrompt;
};

type LibnpmpublishOptions = {
    readonly defaultTag: string;
    readonly access: 'public';
    readonly registry: string;
    readonly authType: 'web';
    readonly forceAuth?: { readonly token: string };
};

type LibnpmpublishFunction = (
    manifest: PublicationManifest,
    tarball: Buffer,
    options: LibnpmpublishOptions
) => Promise<unknown>;

export type PackagePublicationDependencies = {
    readonly publish: LibnpmpublishFunction;
};

export type PackagePublication = {
    readonly publish: (input: PublicationInput) => Promise<void>;
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return value instanceof Object && !Array.isArray(value);
}

function isOneTimePasswordRequiredError(error: unknown): error is { readonly body?: unknown } {
    return isRecord(error) && error.code === 'EOTP';
}

function extractWebOtpUrls(error: { readonly body?: unknown }): WebOtpUrls | undefined {
    const { body } = error;
    if (!isRecord(body)) {
        return undefined;
    }
    const { authUrl, doneUrl } = body;
    if (typeof authUrl !== 'string' || typeof doneUrl !== 'string') {
        return undefined;
    }
    return { authUrl, doneUrl };
}

export function createPackagePublication(dependencies: Readonly<PackagePublicationDependencies>): PackagePublication {
    const { publish } = dependencies;

    return {
        async publish(input) {
            const baseOptions: LibnpmpublishOptions = {
                defaultTag: input.distTag,
                access: 'public',
                registry: input.registryUrl,
                authType: 'web'
            };

            try {
                await publish(input.manifest, input.tarball, baseOptions);
            } catch (error) {
                if (!isOneTimePasswordRequiredError(error)) {
                    throw error;
                }
                const token = await input.promptForOneTimePassword(extractWebOtpUrls(error));
                await publish(input.manifest, input.tarball, { ...baseOptions, forceAuth: { token } });
            }
        }
    };
}
