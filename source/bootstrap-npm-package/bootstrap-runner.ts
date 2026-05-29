import type { PackagePublication, PublicationManifest } from './package-publication.ts';
import type { PlaceholderTarballBuilder } from './placeholder-tarball.ts';
import type { VersionDeprecation } from './version-deprecation.ts';
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
    readonly versionDeprecation: VersionDeprecation;
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

function buildManifest(packageName: string, workaroundUrl: string): PublicationManifest {
    return {
        name: packageName,
        version: placeholderVersion,
        description: buildManifestDescription(packageName, workaroundUrl),
        license: placeholderLicense
    };
}

function buildReadme(packageName: string, workaroundUrl: string): string {
    return [
        `# ${packageName}`,
        '',
        `This version is a placeholder published only to claim the npm name \`${packageName}\` so a Trusted Publisher`,
        'can subsequently be configured for it. It contains no real package content and is deprecated immediately',
        'after publication.',
        '',
        `Workaround context: ${workaroundUrl}`,
        ''
    ].join('\n');
}

function buildDeprecationMessage(workaroundUrl: string): string {
    return `Placeholder published as a workaround so a Trusted Publisher could be configured. See ${workaroundUrl}.`;
}

function buildTrustedPublisherUrl(packageName: string): string {
    return `https://www.npmjs.com/package/${packageName}/access`;
}

type PublishAndDeprecateInput = {
    readonly input: BootstrapInput;
    readonly manifest: PublicationManifest;
    readonly tarball: Buffer;
    readonly token: string;
};

type PublishAndDeprecateDependencies = Pick<
    BootstrapRunnerDependencies,
    'log' | 'packagePublication' | 'promptForOneTimePassword' | 'versionDeprecation'
>;

async function runPublishAndDeprecate(
    dependencies: PublishAndDeprecateDependencies,
    payload: PublishAndDeprecateInput
): Promise<void> {
    const { packagePublication, versionDeprecation, promptForOneTimePassword, log } = dependencies;
    const { input, manifest, tarball, token } = payload;

    log(`Publishing ${input.packageName}@${manifest.version} with dist-tag "${input.distTag}"`);
    await packagePublication.publish({
        manifest,
        tarball,
        token,
        registryUrl: input.registryUrl,
        distTag: input.distTag,
        promptForOneTimePassword
    });

    log(`Deprecating ${input.packageName}@${manifest.version}`);
    await versionDeprecation.deprecate({
        packageName: input.packageName,
        version: manifest.version,
        message: buildDeprecationMessage(input.workaroundUrl),
        token,
        registryUrl: input.registryUrl,
        promptForOneTimePassword
    });
}

function buildAuthenticatedMessage(username: string | undefined): string {
    return username === undefined || username.length === 0
        ? 'Authenticated to npm'
        : `Authenticated to npm as ${username}`;
}

export function createBootstrapRunner(dependencies: Readonly<BootstrapRunnerDependencies>): BootstrapRunner {
    const {
        placeholderTarballBuilder,
        webLogin,
        packagePublication,
        versionDeprecation,
        promptForOneTimePassword,
        log
    } = dependencies;

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

            await runPublishAndDeprecate(
                { packagePublication, versionDeprecation, promptForOneTimePassword, log },
                { input, manifest, tarball, token: session.token }
            );

            log(`Done. Configure the Trusted Publisher at ${buildTrustedPublisherUrl(input.packageName)}`);
        }
    };
}
