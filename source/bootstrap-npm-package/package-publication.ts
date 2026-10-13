export type PublicationManifest = {
    readonly name: string;
    readonly version: string;
    readonly description: string;
    readonly license: string;
    readonly deprecated: string;
};

export type WebOneTimePasswordAddresses = {
    readonly authenticationAddress: string;
    readonly doneAddress: string;
};

type OneTimePasswordPrompt = (webOneTimePasswordAddresses: WebOneTimePasswordAddresses | undefined) => Promise<string>;

type PublicationInput = {
    readonly manifest: PublicationManifest;
    readonly tarball: Buffer;
    readonly token: string;
    readonly registryAddress: string;
    readonly distTag: string;
    readonly promptForOneTimePassword: OneTimePasswordPrompt;
};

type LibnpmpublishOptions = {
    readonly defaultTag: string;
    readonly access: 'public';
    readonly registry: string;
    readonly forceAuth: { readonly token: string; };
    readonly authType: 'web';
    readonly otp?: string;
};

type LibnpmpublishFunction = (
    manifest: PublicationManifest,
    tarball: Buffer,
    options: LibnpmpublishOptions
) => Promise<unknown>;

type OneTimePasswordRequiredError = {
    readonly code: 'EOTP';
    readonly body?: unknown;
};

export type PackagePublicationDependencies = {
    readonly publish: LibnpmpublishFunction;
};

export type PackagePublication = {
    readonly publish: (input: PublicationInput) => Promise<void>;
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return value instanceof Object && !Array.isArray(value);
}

function isOneTimePasswordRequiredError(error: unknown): error is OneTimePasswordRequiredError {
    return isRecord(error) && error.code === 'EOTP';
}

function extractWebOneTimePasswordAddresses(
    error: OneTimePasswordRequiredError
): WebOneTimePasswordAddresses | undefined {
    const { body } = error;
    if (!isRecord(body)) {
        return undefined;
    }
    const { authUrl: authenticationAddress, doneUrl: doneAddress } = body;
    if (typeof authenticationAddress !== 'string' || typeof doneAddress !== 'string') {
        return undefined;
    }
    return { authenticationAddress, doneAddress };
}

export function createPackagePublication(dependencies: Readonly<PackagePublicationDependencies>): PackagePublication {
    const { publish } = dependencies;

    return {
        async publish(input) {
            const baseOptions: LibnpmpublishOptions = {
                defaultTag: input.distTag,
                access: 'public',
                registry: input.registryAddress,
                forceAuth: { token: input.token },
                authType: 'web'
            };

            try {
                await publish(input.manifest, input.tarball, baseOptions);
            } catch (error) {
                if (!isOneTimePasswordRequiredError(error)) {
                    throw error;
                }
                const oneTimePassword = await input.promptForOneTimePassword(extractWebOneTimePasswordAddresses(error));
                await publish(input.manifest, input.tarball, { ...baseOptions, otp: oneTimePassword });
            }
        }
    };
}
