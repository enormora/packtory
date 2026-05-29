export type PublicationManifest = {
    readonly name: string;
    readonly version: string;
    readonly description: string;
    readonly license: string;
};

type OneTimePasswordPrompt = () => Promise<string>;

type PublicationInput = {
    readonly manifest: PublicationManifest;
    readonly tarball: Buffer;
    readonly token: string;
    readonly registryUrl: string;
    readonly distTag: string;
    readonly promptForOneTimePassword: OneTimePasswordPrompt;
};

type LibnpmpublishOptions = {
    readonly defaultTag: string;
    readonly access: 'public';
    readonly registry: string;
    readonly forceAuth: { readonly token: string };
    readonly otpPrompt: OneTimePasswordPrompt;
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

export function createPackagePublication(dependencies: Readonly<PackagePublicationDependencies>): PackagePublication {
    const { publish } = dependencies;

    return {
        async publish(input) {
            await publish(input.manifest, input.tarball, {
                defaultTag: input.distTag,
                access: 'public',
                registry: input.registryUrl,
                forceAuth: { token: input.token },
                otpPrompt: input.promptForOneTimePassword
            });
        }
    };
}
