import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { RealFileSystemHost } from '@ts-morph/common';
import { publish } from 'libnpmpublish';
import npmFetch from 'npm-registry-fetch';
import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget } from 'ts-morph';
import { createArtifactsBuilder, type ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import { createBundleEmitter, type BundleEmitter } from '../bundle-emitter/emitter.ts';
import { createRegistryClient, type RegistryClient } from '../bundle-emitter/registry/registry-client.ts';
import { createPackEmitter, type PackEmitter } from '../pack-emitter/pack-emitter.ts';
import { createVendorMaterializer, type VendorMaterializer } from '../vendor-materializer/vendor-materializer.ts';
import { getCiRepositoryUrl, type CiEnvironment } from '../bundle-emitter/repository-coherence.ts';
import type { DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import { createDeadCodeEliminator } from '../dead-code-eliminator/eliminator.ts';
import { createDependencyScanner, type DependencyScanner } from '../dependency-scanner/scanner.ts';
import { getReferencedModules } from '../dependency-scanner/source-file-references.ts';
import { createSourceMapFileLocator } from '../dependency-scanner/source-map-file-locator.ts';
import { createFileSystemAdapters } from '../dependency-scanner/typescript-file-host.ts';
import { createTypescriptProjectAnalyzer } from '../dependency-scanner/typescript-project-analyzer.ts';
import { createFileManager, type FileManager } from '../file-manager/file-manager.ts';
import { createBundleLinker } from '../linker/linker.ts';
import { createPackageProcessor, type PackageProcessor } from '../packtory/package-processor.ts';
import type { VersionSourceResolver } from '../packtory/map-config.ts';
import { createProgressBroadcaster, type ProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { withStageTimings } from '../report/decorators.ts';
import { createResourceResolver, type ResourceResolver } from '../resource-resolver/resource-resolver.ts';
import { createTarballBuilder } from '../tar/tarball-builder.ts';
import { createZipBuilder } from '../zip/zip-builder.ts';
import { createVersionManager, type VersionManager } from '../version-manager/manager.ts';
import { createClock, type Clock } from '../common/clock.ts';
import { createCurrentGitHeadReader, type CurrentGitHeadReader } from '../git/current-git-head.ts';
import { createNpmOidcIdTokenResolver } from '../npm-oidc-id-token-resolver.ts';
import { createLicenseResolver } from '../sbom/license-resolver.ts';
import { createSbomFileBuilder, type SbomFileBuilder } from '../sbom/sbom-file.ts';
import { createSbomSerializer } from '../sbom/sbom-serializer.ts';
import { createPacktoryToolVersionResolver } from '../sbom/tool-version.ts';

async function importPackageJson(specifier: string): Promise<unknown> {
    return await import(specifier, { with: { type: 'json' } });
}

async function runGitCommand(
    command: string,
    args: readonly string[]
): Promise<{
    readonly stdout: string;
    readonly stderr: string;
}> {
    return new Promise(function (resolve, reject) {
        execFile(command, Array.from(args), function (error, stdout, stderr) {
            if (error !== null) {
                reject(error instanceof Error ? error : new Error('Git command failed'));
                return;
            }
            resolve({ stdout, stderr });
        });
    });
}

export type PackageProcessorComposition = {
    readonly fileManager: FileManager;
    readonly packageProcessor: PackageProcessor;
    readonly progressBroadcaster: ProgressBroadcaster;
    readonly deadCodeEliminator: DeadCodeEliminator;
    readonly artifactsBuilder: ArtifactsBuilder;
    readonly versionManager: VersionManager;
    readonly packEmitter: PackEmitter;
    readonly vendorMaterializer: VendorMaterializer;
    readonly readCurrentGitHead: CurrentGitHeadReader;
    readonly repositoryFolder: string;
};

export type PackageProcessorCompositionOptions = {
    readonly promptForOneTimePassword?: (() => Promise<string | undefined>) | undefined;
    readonly ciEnvironment: CiEnvironment;
    readonly repositoryFolder?: string | undefined;
    readonly resolveVersionSource?: VersionSourceResolver | undefined;
};

function getEnvironmentVariable(variableName: string): string | undefined {
    const environment = process.env[variableName];
    return environment === undefined || environment.length === 0 ? undefined : environment;
}

function createDependencyScannerWith(fileManager: FileManager): DependencyScanner {
    const sourceMapFileLocator = createSourceMapFileLocator({ fileManager });
    const fileSystemAdapters = createFileSystemAdapters({ fileSystemHost: new RealFileSystemHost() });
    const typescriptProjectAnalyzer = createTypescriptProjectAnalyzer({
        Project,
        getReferencedModules,
        fileSystemAdapters
    });
    return createDependencyScanner({ sourceMapFileLocator, typescriptProjectAnalyzer });
}

function buildRegistryClient(options: PackageProcessorCompositionOptions, clock: Clock): RegistryClient {
    return createRegistryClient({
        npmFetch,
        publish,
        fetch,
        clock,
        resolveIdToken: createNpmOidcIdTokenResolver({
            fetch,
            getEnvironmentVariable
        }),
        promptForOneTimePassword: options.promptForOneTimePassword
    });
}

function buildSbomFileBuilder(fileManager: FileManager): SbomFileBuilder {
    return createSbomFileBuilder({
        licenseResolver: createLicenseResolver({ fileManager }),
        sbomSerializer: createSbomSerializer(),
        toolVersionProvider: createPacktoryToolVersionResolver({ importPackageJson }),
        projectFolder: process.cwd()
    });
}

function buildBundleEmitter(
    options: PackageProcessorCompositionOptions,
    artifactsBuilder: ArtifactsBuilder,
    readCurrentGitHead: CurrentGitHeadReader
): BundleEmitter {
    const registryClient = buildRegistryClient(options, createClock());
    return createBundleEmitter({
        registryClient,
        artifactsBuilder,
        ciRepositoryUrl: getCiRepositoryUrl(options.ciEnvironment),
        readCurrentGitHead
    });
}

function buildDeadCodeEliminator(progressBroadcaster: ProgressBroadcaster): DeadCodeEliminator {
    return createDeadCodeEliminator({
        progressBroadcaster: progressBroadcaster.provider,
        createProject() {
            return new Project({
                compilerOptions: {
                    allowJs: true,
                    module: ModuleKind.Node16,
                    esModuleInterop: true,
                    noLib: true,
                    target: ScriptTarget.ES2022,
                    moduleResolution: ModuleResolutionKind.Node10
                },
                skipLoadingLibFiles: true,
                useInMemoryFileSystem: true
            });
        }
    });
}

type CompositionParts = {
    readonly fileManager: FileManager;
    readonly progressBroadcaster: ProgressBroadcaster;
    readonly artifactsBuilder: ArtifactsBuilder;
    readonly bundleEmitter: BundleEmitter;
    readonly resourceResolver: ResourceResolver;
    readonly sbomFileBuilder: SbomFileBuilder;
    readonly deadCodeEliminator: DeadCodeEliminator;
    readonly readCurrentGitHead: CurrentGitHeadReader;
    readonly repositoryFolder: string;
};

function buildCompositionParts(options: PackageProcessorCompositionOptions): CompositionParts {
    const repositoryFolder = options.repositoryFolder ?? process.cwd();
    const fileManager = createFileManager({ hostFileSystem: fs.promises });
    const readCurrentGitHead = createCurrentGitHeadReader({
        repositoryFolder,
        runGitCommand
    });
    const dependencyScanner = createDependencyScannerWith(fileManager);
    const progressBroadcaster = createProgressBroadcaster();
    const artifactsBuilder = createArtifactsBuilder({
        fileManager,
        tarballBuilder: createTarballBuilder({ fileManager }),
        zipBuilder: createZipBuilder({ fileManager }),
        progressBroadcaster: progressBroadcaster.provider
    });
    return {
        fileManager,
        progressBroadcaster,
        artifactsBuilder,
        bundleEmitter: buildBundleEmitter(options, artifactsBuilder, readCurrentGitHead),
        resourceResolver: createResourceResolver({ fileManager, dependencyScanner }),
        sbomFileBuilder: buildSbomFileBuilder(fileManager),
        deadCodeEliminator: buildDeadCodeEliminator(progressBroadcaster),
        readCurrentGitHead,
        repositoryFolder
    };
}

export function buildPackageProcessorComposition(
    options: PackageProcessorCompositionOptions
): PackageProcessorComposition {
    const parts = buildCompositionParts(options);
    const versionManager = createVersionManager({ progressBroadcaster: parts.progressBroadcaster.provider });
    const basePackageProcessor = createPackageProcessor({
        progressBroadcaster: parts.progressBroadcaster.provider,
        versionManager,
        bundleEmitter: parts.bundleEmitter,
        linker: createBundleLinker(),
        resourceResolver: parts.resourceResolver,
        sbomFileBuilder: parts.sbomFileBuilder,
        deadCodeEliminator: parts.deadCodeEliminator,
        fileManager: parts.fileManager,
        repositoryFolder: parts.repositoryFolder
    });
    const packageProcessor = withStageTimings(basePackageProcessor, parts.progressBroadcaster.provider);
    const packEmitter = createPackEmitter({
        artifactsBuilder: parts.artifactsBuilder,
        fileManager: parts.fileManager
    });
    const vendorMaterializer = createVendorMaterializer({ fileManager: parts.fileManager });

    return {
        fileManager: parts.fileManager,
        packageProcessor,
        progressBroadcaster: parts.progressBroadcaster,
        deadCodeEliminator: parts.deadCodeEliminator,
        artifactsBuilder: parts.artifactsBuilder,
        versionManager,
        packEmitter,
        vendorMaterializer,
        readCurrentGitHead: parts.readCurrentGitHead,
        repositoryFolder: parts.repositoryFolder
    };
}
