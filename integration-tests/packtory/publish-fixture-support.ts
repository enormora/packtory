import path from 'node:path';
import assert from 'node:assert';
import npmFetch from 'npm-registry-fetch';
import { publish } from 'libnpmpublish';
import { loadPackageJson } from '../load-package-json.ts';
import type { RegistryDetails } from '../registry.ts';
import { createTarballBuilder, type TarballBuilder } from '../../source/tar/tarball-builder.ts';
import {
    buildAndPublishAll,
    type PacktoryConfig,
    type PublishAllResult
} from '../../source/packages/packtory/packtory.entry-point.ts';
import { createRegistryClient } from '../../source/bundle-emitter/registry/registry-client.ts';
import { extractPackageTarball } from '../../source/bundle-emitter/extract-package-tarball.ts';

const timers = process.getBuiltinModule('node:timers');
const fs = process.getBuiltinModule('node:fs').promises;
const nodeCrypto = process.getBuiltinModule('node:crypto');

const registryClient = createRegistryClient({
    npmFetch,
    publish,
    fetch,
    clock: {
        getCurrentTimeInMilliseconds() {
            return Date.now();
        },
        setTimeout: timers.setTimeout,
        clearTimeout: timers.clearTimeout
    },
    async resolveIdToken() {
        throw new Error('OIDC id tokens are not used in this integration test');
    }
});

export type PublishedFile = Awaited<ReturnType<typeof extractPackageTarball>>[number];

export type PublishedPackage = {
    readonly version: string;
    readonly files: readonly PublishedFile[];
    readonly manifest: Readonly<Record<string, unknown>>;
};

export type PackageConfig = PacktoryConfig['packages'][number];
export type PackageConfigList = readonly [PackageConfig, ...(readonly PackageConfig[])];
type CommonPackageSettings = NonNullable<PacktoryConfig['commonPackageSettings']>;
type PublishConfig = PacktoryConfig & {
    readonly commonPackageSettings: CommonPackageSettings & {
        readonly sourcesFolder: string;
        readonly mainPackageJson: NonNullable<CommonPackageSettings['mainPackageJson']>;
    };
};
type CreatePublishConfigInput = {
    readonly fixturePath: string;
    readonly registryDetails: RegistryDetails;
    readonly packages: PackageConfigList;
    readonly commonPackageSettings?: Partial<CommonPackageSettings>;
    readonly mainPackageJsonOverrides?: Partial<NonNullable<CommonPackageSettings['mainPackageJson']>>;
};
type PublishFixturePackagesInput = {
    readonly fixturePath: string;
    readonly registryDetails: RegistryDetails;
    readonly packages?: PackageConfigList;
    readonly commonPackageSettings?: Partial<CommonPackageSettings>;
    readonly authMode?: 'basic' | 'bearer';
    readonly mainPackageJsonOverrides?: Partial<NonNullable<CommonPackageSettings['mainPackageJson']>>;
};
type PublishTaggedVersionInput = {
    readonly distTag: string;
    readonly latestVersion: string;
    readonly name: string;
    readonly registryDetails: RegistryDetails;
    readonly version: string;
};
type StoredPackageDocument = {
    readonly _id: string;
    readonly name: string;
    readonly 'dist-tags': Readonly<Record<string, string>>;
    readonly versions: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
    readonly time: Readonly<Record<string, string>>;
    readonly users: Readonly<Record<string, never>>;
    readonly _uplinks: Readonly<Record<string, never>>;
    readonly _distfiles: Readonly<Record<string, { readonly url: string; }>>;
    readonly _attachments: Readonly<Record<string, { readonly version: string; }>>;
    readonly _rev: string;
};
type TarballData = Awaited<ReturnType<TarballBuilder['build']>>;
type StoredPackageDocumentInput = {
    readonly attachmentName: string;
    readonly distTag: string;
    readonly latestVersion: string;
    readonly manifest: Readonly<Record<string, unknown>>;
    readonly name: string;
    readonly packageIntegrity: string;
    readonly tarballUrl: string;
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
    authMode: PublishFixturePackagesInput['authMode'] = 'bearer'
): NonNullable<PublishConfig['registrySettings']> {
    if (authMode === 'basic') {
        return {
            registryUrl: registryDetails.registryUrl,
            auth: {
                type: 'basic',
                username: registryDetails.username,
                password: registryDetails.password
            }
        };
    }

    return {
        registryUrl: registryDetails.registryUrl,
        auth: {
            type: 'bearer-token',
            token: registryDetails.token
        }
    };
}

function createRoot(fixturePath: string, entryBaseName: string): PackageConfig['roots'][string] {
    return {
        js: path.join(fixturePath, `src/${entryBaseName}.js`),
        declarationFile: path.join(fixturePath, `src/${entryBaseName}.d.ts`)
    };
}

export function createPackageConfig(
    fixturePath: string,
    name: string,
    entryBaseName: string,
    overrides: Partial<PackageConfig> = {}
): PackageConfig {
    return {
        name,
        roots: { main: createRoot(fixturePath, entryBaseName) },
        ...overrides
    };
}

export function createPackageConfigList<TFirst extends PackageConfig, TRest extends readonly PackageConfig[]>(
    first: TFirst,
    ...rest: TRest
): readonly [TFirst, ...TRest] {
    return [ first, ...rest ];
}

export function standardFixturePackages(fixturePath: string): PackageConfigList {
    return createPackageConfigList(
        createPackageConfig(fixturePath, 'first', 'entry1'),
        createPackageConfig(fixturePath, 'second', 'entry2', { bundleDependencies: [ 'first' ] })
    );
}

export function getFixturePath(name: string): string {
    return path.join(process.cwd(), `integration-tests/fixtures/${name}`);
}

async function createPublishConfig(input: CreatePublishConfigInput): Promise<PublishConfig> {
    const { fixturePath, registryDetails, packages, commonPackageSettings, mainPackageJsonOverrides } = input;
    const baseMainPackageJson = await loadPackageJson(fixturePath);
    const mergedMainPackageJson = { ...baseMainPackageJson, ...mainPackageJsonOverrides };
    const mergedCommonPackageSettings: PublishConfig['commonPackageSettings'] = {
        publishSettings: { access: 'public', sbom: { enabled: false } },
        deadCodeElimination: { enabled: false },
        ...commonPackageSettings,
        sourcesFolder: path.join(fixturePath, 'src'),
        mainPackageJson: mergedMainPackageJson
    };

    return {
        registrySettings: createRegistrySettings(registryDetails),
        commonPackageSettings: mergedCommonPackageSettings,
        packages
    };
}

export async function publishFixturePackages(input: PublishFixturePackagesInput): Promise<PublishAllResult> {
    const configInput = {
        fixturePath: input.fixturePath,
        registryDetails: input.registryDetails,
        packages: input.packages ?? standardFixturePackages(input.fixturePath),
        ...input.commonPackageSettings === undefined ? {} : { commonPackageSettings: input.commonPackageSettings },
        ...input.mainPackageJsonOverrides === undefined ? {} : {
            mainPackageJsonOverrides: input.mainPackageJsonOverrides
        }
    };
    const config = await createPublishConfig(configInput);
    const registrySettings = createRegistrySettings(input.registryDetails, input.authMode ?? 'basic');

    const outcome = await buildAndPublishAll({ ...config, registrySettings }, { dryRun: false, stage: false });
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
        _id: input.name,
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
                    tarball: input.tarballUrl
                }
            },
            [input.version]: {
                ...input.manifest,
                dist: {
                    integrity: input.packageIntegrity,
                    tarball: input.tarballUrl
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
            [input.attachmentName]: { url: input.tarballUrl }
        },
        _attachments: {
            [input.attachmentName]: {
                version: input.version
            }
        },
        _rev: '1-fixture'
    };
}

async function writeStoredPackage(input: WriteStoredPackageInput): Promise<void> {
    const packageFolder = path.join(input.registryDetails.storageDirectory, input.name);
    await fs.mkdir(packageFolder, { recursive: true });
    await fs.writeFile(path.join(packageFolder, input.attachmentName), input.tarball);
    await fs.writeFile(path.join(packageFolder, 'package.json'), JSON.stringify(input.packageDocument, null, '\t'));

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
    const tarballUrl = `${input.registryDetails.registryUrl}/${input.name}/-/${attachmentName}`;
    const packageIntegrity = await createTarballIntegrity(tarball);
    const packageDocument = createStoredPackageDocument({
        attachmentName,
        distTag: input.distTag,
        latestVersion: input.latestVersion,
        manifest,
        name: input.name,
        packageIntegrity,
        tarballUrl,
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

    const { version, tarballUrl, tarballIntegrity } = versionDetails.value;
    const tarballData = await registryClient.fetchTarball(tarballUrl, tarballIntegrity, registrySettings);
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
