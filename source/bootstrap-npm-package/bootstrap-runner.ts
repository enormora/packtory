import type { PackagePublication, PublicationManifest, WebOtpUrls } from './package-publication.ts';
import type { PlaceholderTarballBuilder } from './placeholder-tarball.ts';
import type { WebLogin } from './web-login.ts';

export type BootstrapInput = {
    readonly packageName: string;
    readonly hostname: string;
};

export type BootstrapRunnerDependencies = {
    readonly placeholderTarballBuilder: PlaceholderTarballBuilder;
    readonly webLogin: WebLogin;
    readonly packagePublication: PackagePublication;
    readonly promptForOneTimePassword: (webOtpUrls: WebOtpUrls | undefined) => Promise<string>;
    readonly log: (message: string) => void;
};

export type BootstrapRunner = {
    readonly run: (input: BootstrapInput) => Promise<void>;
};

const registryUrl = 'https://registry.npmjs.org/';
const workaroundUrl = 'https://github.com/npm/cli/issues/8544';
const distTag = 'bootstrap';
const placeholderVersion = '0.0.1';
const placeholderLicense = 'MIT';

function buildManifestDescription(packageName: string): string {
    return (
        `Placeholder claiming the npm package name "${packageName}" so a trusted publisher ` +
        `can be configured. See ${workaroundUrl}.`
    );
}

function buildDeprecationMessage(): string {
    return `Placeholder published as a workaround so a Trusted Publisher could be configured. See ${workaroundUrl}.`;
}

function buildManifest(packageName: string): PublicationManifest {
    return {
        name: packageName,
        version: placeholderVersion,
        description: buildManifestDescription(packageName),
        license: placeholderLicense,
        deprecated: buildDeprecationMessage()
    };
}

function buildReadme(packageName: string): string {
    return [
        `# ${packageName}`,
        '',
        `This version is a placeholder published only to claim the npm name \`${packageName}\` so a Trusted Publisher`,
        'can subsequently be configured for it. It contains no real package content and is published already',
        'deprecated.',
        '',
        `Workaround context: ${workaroundUrl}`,
        ''
    ]
        .join('\n');
}

function buildTrustedPublisherUrl(packageName: string): string {
    return `https://www.npmjs.com/package/${packageName}/access`;
}

function buildAuthenticatedMessage(username: string | undefined): string {
    return username === undefined || username.length === 0
        ? 'Authenticated to npm'
        : `Authenticated to npm as ${username}`;
}

function buildPublishLogMessage(packageName: string, version: string): string {
    return `Publishing ${packageName}@${version} (already deprecated) under dist-tag ${distTag}`;
}

export function createBootstrapRunner(dependencies: Readonly<BootstrapRunnerDependencies>): BootstrapRunner {
    const { placeholderTarballBuilder, webLogin, packagePublication, promptForOneTimePassword, log } = dependencies;

    return {
        async run(input) {
            const manifest = buildManifest(input.packageName);
            const readmeContent = buildReadme(input.packageName);

            log(`Building placeholder tarball for ${input.packageName}@${manifest.version}`);
            const tarball = await placeholderTarballBuilder.build({ manifest, readmeContent });

            log('Opening browser for npm web login');
            const session = await webLogin.login({ registryUrl, hostname: input.hostname });
            log(buildAuthenticatedMessage(session.username));

            log(buildPublishLogMessage(input.packageName, manifest.version));
            await packagePublication.publish({
                manifest,
                tarball,
                token: session.token,
                registryUrl,
                distTag,
                promptForOneTimePassword
            });

            log(`Done. Configure the Trusted Publisher at ${buildTrustedPublisherUrl(input.packageName)}`);
        }
    };
}
