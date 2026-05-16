import path from 'node:path';
import assert from 'node:assert';
import npmFetch from 'npm-registry-fetch';
import { publish } from 'libnpmpublish';
import { loadPackageJson } from '../load-package-json.ts';
import type { RegistryDetails } from '../registry.ts';
import {
    buildAndPublishAll,
    type PacktoryConfig,
    type PublishAllResult
} from '../../source/packages/packtory/packtory.entry-point.ts';
import { createRegistryClient } from '../../source/bundle-emitter/registry-client.ts';
import { extractPackageTarball } from '../../source/bundle-emitter/extract-package-tarball.ts';

const timers = process.getBuiltinModule('node:timers');

const registryClient = createRegistryClient({
    npmFetch,
    publish,
    fetch: globalThis.fetch,
    clock: {
        getCurrentTimeInMilliseconds: () => {
            return Date.now();
        },
        setTimeout: timers.setTimeout,
        clearTimeout: timers.clearTimeout
    },
    resolveIdToken: async () => {
        throw new Error('OIDC id tokens are not used in this integration test');
    }
});

export type PublishedFile = Awaited<ReturnType<typeof extractPackageTarball>>[number];

export type PublishedPackage = {
    readonly version: string;
    readonly files: readonly PublishedFile[];
    readonly manifest: Record<string, unknown>;
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
type CreatePublishConfigParams = {
    readonly fixturePath: string;
    readonly registryDetails: RegistryDetails;
    readonly packages: PackageConfigList;
    readonly commonPackageSettings?: Partial<CommonPackageSettings>;
    readonly mainPackageJsonOverrides?: Partial<NonNullable<CommonPackageSettings['mainPackageJson']>>;
};
type PublishFixturePackagesParams = {
    readonly fixturePath: string;
    readonly registryDetails: RegistryDetails;
    readonly packages?: PackageConfigList;
    readonly commonPackageSettings?: Partial<CommonPackageSettings>;
    readonly authMode?: 'basic' | 'bearer';
    readonly mainPackageJsonOverrides?: Partial<NonNullable<CommonPackageSettings['mainPackageJson']>>;
};

function createRegistrySettings(
    registryDetails: RegistryDetails,
    authMode: PublishFixturePackagesParams['authMode'] = 'bearer'
): PublishConfig['registrySettings'] {
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
    return [first, ...rest];
}

export function standardFixturePackages(fixturePath: string): PackageConfigList {
    return createPackageConfigList(
        createPackageConfig(fixturePath, 'first', 'entry1'),
        createPackageConfig(fixturePath, 'second', 'entry2', { bundleDependencies: ['first'] })
    );
}

export function getFixturePath(name: string): string {
    return path.join(process.cwd(), `integration-tests/fixtures/${name}`);
}

async function createPublishConfig(params: CreatePublishConfigParams): Promise<PublishConfig> {
    const { fixturePath, registryDetails, packages, commonPackageSettings, mainPackageJsonOverrides } = params;
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

export async function publishFixturePackages(params: PublishFixturePackagesParams): Promise<PublishAllResult> {
    const configParams = {
        fixturePath: params.fixturePath,
        registryDetails: params.registryDetails,
        packages: params.packages ?? standardFixturePackages(params.fixturePath),
        ...(params.commonPackageSettings === undefined ? {} : { commonPackageSettings: params.commonPackageSettings }),
        ...(params.mainPackageJsonOverrides === undefined
            ? {}
            : { mainPackageJsonOverrides: params.mainPackageJsonOverrides })
    };
    const config = await createPublishConfig(configParams);
    const registrySettings = createRegistrySettings(params.registryDetails, params.authMode);

    const outcome = await buildAndPublishAll({ ...config, registrySettings }, { dryRun: false });
    return outcome.result;
}

export function assertPublishSucceeded(result: PublishAllResult): void {
    assert.strictEqual(result.isOk, true);
}

function findManifestFile(files: readonly PublishedFile[], packageName: string): PublishedFile {
    const manifestFile = files.find((file) => {
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

    const { version, tarballUrl } = versionDetails.value;
    const tarballData = await registryClient.fetchTarball(tarballUrl, registrySettings);
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
    const file = publishedPackage.files.find((entry) => {
        return entry.filePath === filePath;
    });

    if (file === undefined) {
        assert.fail(`Expected published package to contain "${filePath}"`);
    }

    return file;
}
