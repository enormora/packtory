import path from 'node:path';
import assert from 'node:assert';
import npmFetch from 'npm-registry-fetch';
import { publish } from 'libnpmpublish';
import { loadPackageManifest } from '../load-package-manifest.ts';
import type { RegistryDetails } from '../registry.ts';
import { createTarballBuilder, type TarballBuilder } from '../../source/tar/tarball-builder.ts';
import {
    buildAndPublishAll,
    type PacktoryConfiguration,
    type PublishAllResult
} from '../../source/packages/packtory/packtory.entry-point.ts';
import { createRegistryClient } from '../../source/bundle-emitter/registry/registry-client.ts';
import { extractPackageTarball } from '../../source/bundle-emitter/extract-package-tarball.ts';

const timers = process.getBuiltinModule('node:timers');
const fileSystem = process.getBuiltinModule('node:fs').promises;
const nodeCrypto = process.getBuiltinModule('node:crypto');

const registryClient = createRegistryClient({
    npmFetch: {
        async javaScriptObjectNotation(address, options) {
            return npmFetch.json(address, options);
        }
    },
    publish,
    fetch,
    clock: {
        getCurrentTimeInMilliseconds() {
            return Date.now();
        },
        setTimeout: timers.setTimeout,
        clearTimeout: timers.clearTimeout
    },
    async resolveIdentifierToken() {
        throw new Error('OIDC id tokens are not used in this integration test');
    }
});

export type PublishedFile = Awaited<ReturnType<typeof extractPackageTarball>>[number];

export type PublishedPackage = {
    readonly version: string;
    readonly files: readonly PublishedFile[];
    readonly manifest: Readonly<Record<string, unknown>>;
};

export type PackageConfiguration = PacktoryConfiguration['packages'][number];
export type PackageConfigurationList = readonly [PackageConfiguration, ...(readonly PackageConfiguration[])];
type CommonPackageSettings = NonNullable<PacktoryConfiguration['commonPackageSettings']>;
type PublishConfiguration = PacktoryConfiguration & {
    readonly commonPackageSettings: CommonPackageSettings & {
        readonly sourcesFolder: string;
        readonly mainPackageManifest: NonNullable<CommonPackageSettings['mainPackageManifest']>;
    };
};
type CreatePublishConfigurationInput = {
    readonly fixturePath: string;
    readonly registryDetails: RegistryDetails;
    readonly packages: PackageConfigurationList;
    readonly commonPackageSettings?: Partial<CommonPackageSettings>;
    readonly mainPackageManifestOverrides?: Partial<NonNullable<CommonPackageSettings['mainPackageManifest']>>;
};
type PublishFixturePackagesInput = {
    readonly fixturePath: string;
    readonly registryDetails: RegistryDetails;
    readonly packages?: PackageConfigurationList;
    readonly commonPackageSettings?: Partial<CommonPackageSettings>;
    readonly authenticationMode?: 'basic' | 'bearer';
    readonly dryRun?: boolean;
    readonly mainPackageManifestOverrides?: Partial<NonNullable<CommonPackageSettings['mainPackageManifest']>>;
};
type PublishTaggedVersionInput = {
    readonly distTag: string;
    readonly latestVersion: string;
    readonly name: string;
    readonly registryDetails: RegistryDetails;
    readonly version: string;
};
type StoredPackageDocument = {
    readonly _identifier: string;
    readonly name: string;
    readonly 'dist-tags': Readonly<Record<string, string>>;
    readonly versions: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
    readonly time: Readonly<Record<string, string>>;
    readonly users: Readonly<Record<string, never>>;
    readonly _uplinks: Readonly<Record<string, never>>;
    readonly _distfiles: Readonly<Record<string, { readonly address: string; }>>;
    readonly _attachments: Readonly<Record<string, { readonly version: string; }>>;
    readonly _revision: string;
};
type TarballData = Awaited<ReturnType<TarballBuilder['build']>>;
type StoredPackageDocumentInput = {
    readonly attachmentName: string;
    readonly distTag: string;
    readonly latestVersion: string;
    readonly manifest: Readonly<Record<string, unknown>>;
    readonly name: string;
    readonly packageIntegrity: string;
    readonly tarballAddress: string;
    readonly version: string;
};
type WriteStoredPackageInput = {
    readonly attachmentName: string;
    readonly name: string;
    readonly packageDocument: StoredPackageDocument;
    readonly registryDetails: RegistryDetails;
    readonly tarball: TarballData;
    readonly version: string;
};

function createRegistrySettings(
    registryDetails: RegistryDetails,
    authenticationMode: PublishFixturePackagesInput['authenticationMode'] = 'bearer'
): NonNullable<PublishConfiguration['registrySettings']> {
    if (authenticationMode === 'basic') {
        return {
            registryAddress: registryDetails.registryAddress,
            authentication: {
                type: 'basic',
                username: registryDetails.username,
                password: registryDetails.password
            }
        };
    }

    return {
        registryAddress: registryDetails.registryAddress,
        authentication: {
            type: 'bearer-token',
            token: registryDetails.token
        }
    };
}

function createRoot(fixturePath: string, entryBaseName: string): PackageConfiguration['roots'][string] {
    return {
        javaScript: path.join(fixturePath, `source/${entryBaseName}.js`),
        declarationFile: path.join(fixturePath, `source/${entryBaseName}.d.ts`)
    };
}

export function createPackageConfiguration(
    fixturePath: string,
    name: string,
    entryBaseName: string,
    overrides: Partial<PackageConfiguration> = {}
): PackageConfiguration {
    return {
        name,
        roots: { main: createRoot(fixturePath, entryBaseName) },
        ...overrides
    };
}

export function createPackageConfigurationList<
    TFirst extends PackageConfiguration,
    TRest extends readonly PackageConfiguration[]
>(
    first: TFirst,
    ...rest: TRest
): readonly [TFirst, ...TRest] {
    return [ first, ...rest ];
}

export function standardFixturePackages(fixturePath: string): PackageConfigurationList {
    return createPackageConfigurationList(
        createPackageConfiguration(fixturePath, 'first', 'entry1'),
        createPackageConfiguration(fixturePath, 'second', 'entry2', { bundleDependencies: [ 'first' ] })
    );
}

export function getFixturePath(name: string): string {
    return path.join(process.cwd(), `integration-tests/fixtures/${name}`);
}

export async function createPublishConfiguration(
    input: CreatePublishConfigurationInput
): Promise<PublishConfiguration> {
    const { fixturePath, registryDetails, packages, commonPackageSettings, mainPackageManifestOverrides } = input;
    const baseMainPackageManifest = await loadPackageManifest(fixturePath);
    const mergedMainPackageManifest = { ...baseMainPackageManifest, ...mainPackageManifestOverrides };
    const mergedCommonPackageSettings: PublishConfiguration['commonPackageSettings'] = {
        publishSettings: { access: 'public', softwareBillOfMaterials: { enabled: false } },
        deadCodeElimination: { enabled: false },
        ...commonPackageSettings,
        sourcesFolder: path.join(fixturePath, 'source'),
        mainPackageManifest: mergedMainPackageManifest
    };

    return {
        registrySettings: createRegistrySettings(registryDetails),
        commonPackageSettings: mergedCommonPackageSettings,
        packages
    };
}

export async function publishFixturePackages(input: PublishFixturePackagesInput): Promise<PublishAllResult> {
    const configurationInput = {
        fixturePath: input.fixturePath,
        registryDetails: input.registryDetails,
        packages: input.packages ?? standardFixturePackages(input.fixturePath),
        ...input.commonPackageSettings === undefined ? {} : { commonPackageSettings: input.commonPackageSettings },
        ...input.mainPackageManifestOverrides === undefined ? {} : {
            mainPackageManifestOverrides: input.mainPackageManifestOverrides
        }
    };
    const configuration = await createPublishConfiguration(configurationInput);
    const registrySettings = createRegistrySettings(input.registryDetails, input.authenticationMode ?? 'basic');

    const outcome = await buildAndPublishAll(
        { ...configuration, registrySettings },
        { dryRun: input.dryRun ?? false, stage: false }
    );
    return outcome.result;
}

async function createTarballIntegrity(tarball: TarballData): Promise<string> {
    const digest = await nodeCrypto.webcrypto.subtle.digest('SHA-512', new Uint8Array(tarball));
    return `sha512-${Buffer.from(digest).toString('base64')}`;
}

function createStoredPackageDocument(input: StoredPackageDocumentInput): StoredPackageDocument {
    const publishedDate = new Date();
    const publishedAt = publishedDate.toISOString();
    return {
        _identifier: input.name,
        name: input.name,
        'dist-tags': {
            latest: input.latestVersion,
            [input.distTag]: input.version
        },
        versions: {
            [input.latestVersion]: {
                ...input.manifest,
                version: input.latestVersion,
                dist: {
                    integrity: input.packageIntegrity,
                    tarball: input.tarballAddress
                }
            },
            [input.version]: {
                ...input.manifest,
                dist: {
                    integrity: input.packageIntegrity,
                    tarball: input.tarballAddress
                }
            }
        },
        time: {
            created: publishedAt,
            modified: publishedAt,
            [input.latestVersion]: publishedAt,
            [input.version]: publishedAt
        },
        users: {},
        _uplinks: {},
        _distfiles: {
            [input.attachmentName]: { address: input.tarballAddress }
        },
        _attachments: {
            [input.attachmentName]: {
                version: input.version
            }
        },
        _revision: '1-fixture'
    };
}

async function writeStoredPackage(input: WriteStoredPackageInput): Promise<void> {
    const packageFolder = path.join(input.registryDetails.storageDirectory, input.name);
    await fileSystem.mkdir(packageFolder, { recursive: true });
    await fileSystem.writeFile(path.join(packageFolder, input.attachmentName), input.tarball);
    await fileSystem.writeFile(
        path.join(packageFolder, 'package.json'),
        JSON.stringify(input.packageDocument, null, '\t')
    );

    const registrySettings = createRegistrySettings(input.registryDetails);
    const metadata = await registryClient.fetchVersionReleaseMetadata(input.name, input.version, registrySettings);
    if (metadata.isNothing) {
        throw new Error(`Seeded tagged fixture version "${input.name}@${input.version}" was not readable`);
    }
}

export async function publishTaggedRegistryVersion(input: PublishTaggedVersionInput): Promise<void> {
    const manifest = {
        name: input.name,
        version: input.version,
        type: 'module'
    };
    const tarball = await createTarballBuilder().build([
        {
            filePath: 'package/package.json',
            content: JSON.stringify(manifest),
            isExecutable: false
        },
        {
            filePath: 'package/index.js',
            content: 'export {};\n',
            isExecutable: false
        }
    ]);
    const attachmentName = `${input.name}-${input.version}.tgz`;
    const tarballAddress = `${input.registryDetails.registryAddress}/${input.name}/-/${attachmentName}`;
    const packageIntegrity = await createTarballIntegrity(tarball);
    const packageDocument = createStoredPackageDocument({
        attachmentName,
        distTag: input.distTag,
        latestVersion: input.latestVersion,
        manifest,
        name: input.name,
        packageIntegrity,
        tarballAddress,
        version: input.version
    });
    await writeStoredPackage({
        attachmentName,
        name: input.name,
        packageDocument,
        registryDetails: input.registryDetails,
        tarball,
        version: input.version
    });
}

export function assertPublishSucceeded(result: PublishAllResult): void {
    assert.strictEqual(result.isOk, true);
}

function findManifestFile(files: readonly PublishedFile[], packageName: string): PublishedFile {
    const manifestFile = files.find(function (file) {
        return file.filePath === 'package/package.json';
    });

    if (manifestFile === undefined) {
        assert.fail(`Expected tarball for "${packageName}" to contain package/package.json`);
    }

    return manifestFile;
}

export async function fetchPublishedPackage(
    packageName: string,
    registryDetails: RegistryDetails
): Promise<PublishedPackage> {
    const registrySettings = createRegistrySettings(registryDetails);
    const versionDetails = await registryClient.fetchLatestVersion(packageName, registrySettings);

    if (versionDetails.isNothing) {
        assert.fail(`Expected package "${packageName}" to be published`);
    }

    const { version, tarballAddress, tarballIntegrity } = versionDetails.value;
    const tarballData = await registryClient.fetchTarball(tarballAddress, tarballIntegrity, registrySettings);
    const files = await extractPackageTarball(tarballData);
    const manifestFile = findManifestFile(files, packageName);

    return {
        version,
        files,
        manifest: JSON.parse(manifestFile.content) as Record<string, unknown>
    };
}

export async function assertPackageNotPublished(packageName: string, registryDetails: RegistryDetails): Promise<void> {
    const registrySettings = createRegistrySettings(registryDetails);
    const versionDetails = await registryClient.fetchLatestVersion(packageName, registrySettings);
    assert.strictEqual(versionDetails.isNothing, true);
}

export function getPublishedFile(publishedPackage: PublishedPackage, filePath: string): PublishedFile {
    const file = publishedPackage.files.find(function (entry) {
        return entry.filePath === filePath;
    });

    if (file === undefined) {
        assert.fail(`Expected published package to contain "${filePath}"`);
    }

    return file;
}
