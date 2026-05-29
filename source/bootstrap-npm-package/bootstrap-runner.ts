import type { PackagePublication, PublicationManifest } from './package-publication.ts';
import type { PlaceholderTarballBuilder } from './placeholder-tarball.ts';
import type { WebLogin } from './web-login.ts';

export type BootstrapInput = {
    readonly packageName: string;
    readonly registryUrl: string;
    readonly workaroundUrl: string;
    readonly distTag: string;
    readonly hostname: string;
};

export type BootstrapRunnerDependencies = {
    readonly placeholderTarballBuilder: PlaceholderTarballBuilder;
    readonly webLogin: WebLogin;
    readonly packagePublication: PackagePublication;
    readonly promptForOneTimePassword: () => Promise<string>;
    readonly log: (message: string) => void;
};

export type BootstrapRunner = {
    readonly run: (input: BootstrapInput) => Promise<void>;
};

const placeholderVersion = '0.0.1';
const placeholderLicense = 'MIT';

function buildManifestDescription(packageName: string, workaroundUrl: string): string {
    return (
        `Placeholder claiming the npm package name "${packageName}" so a trusted publisher ` +
        `can be configured. See ${workaroundUrl}.`
    );
}

function buildDeprecationMessage(workaroundUrl: string): string {
    return `Placeholder published as a workaround so a Trusted Publisher could be configured. See ${workaroundUrl}.`;
}

function buildManifest(packageName: string, workaroundUrl: string): PublicationManifest {
    return {
        name: packageName,
        version: placeholderVersion,
        description: buildManifestDescription(packageName, workaroundUrl),
        license: placeholderLicense,
        deprecated: buildDeprecationMessage(workaroundUrl)
    };
}

function buildReadme(packageName: string, workaroundUrl: string): string {
    return [
        `# ${packageName}`,
        '',
        `This version is a placeholder published only to claim the npm name \`${packageName}\` so a Trusted Publisher`,
        'can subsequently be configured for it. It contains no real package content and is published already',
        'deprecated.',
        '',
        `Workaround context: ${workaroundUrl}`,
        ''
    ].join('\n');
}

function buildTrustedPublisherUrl(packageName: string): string {
    return `https://www.npmjs.com/package/${packageName}/access`;
}

function buildAuthenticatedMessage(username: string | undefined): string {
    return username === undefined || username.length === 0
        ? 'Authenticated to npm'
        : `Authenticated to npm as ${username}`;
}

function buildPublishLogMessage(input: BootstrapInput, version: string): string {
    return `Publishing ${input.packageName}@${version} (already deprecated) under dist-tag ${input.distTag}`;
}

export function createBootstrapRunner(dependencies: Readonly<BootstrapRunnerDependencies>): BootstrapRunner {
    const { placeholderTarballBuilder, webLogin, packagePublication, promptForOneTimePassword, log } = dependencies;

    return {
        async run(input) {
            const manifest = buildManifest(input.packageName, input.workaroundUrl);
            const readmeContent = buildReadme(input.packageName, input.workaroundUrl);

            log(`Building placeholder tarball for ${input.packageName}@${manifest.version}`);
            const tarball = await placeholderTarballBuilder.build({ manifest, readmeContent });

            log('Opening browser for npm web login');
            const session = await webLogin.login({
                registryUrl: input.registryUrl,
                hostname: input.hostname
            });
            log(buildAuthenticatedMessage(session.username));

            log(buildPublishLogMessage(input, manifest.version));
            await packagePublication.publish({
                manifest,
                tarball,
                token: session.token,
                registryUrl: input.registryUrl,
                distTag: input.distTag,
                promptForOneTimePassword
            });

            log(`Done. Configure the Trusted Publisher at ${buildTrustedPublisherUrl(input.packageName)}`);
        }
    };
}
