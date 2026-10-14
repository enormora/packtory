import fileSystem from 'node:fs';
import { execFile as executeFile, type ExecFileException as ExecuteFileException } from 'node:child_process';
import { tmpdir as temporaryDirectory } from 'node:os';
import path from 'node:path';
import { InMemoryFileSystemHost, RealFileSystemHost, type FileSystemHost } from '@ts-morph/common';
import { publish } from 'libnpmpublish';
import npmFetch from 'npm-registry-fetch';
import { getProxyForUrl as getProxyForAddress } from 'proxy-from-env';
import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget } from 'ts-morph';
import { createArtifactsBuilder, type ArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import { createBundleEmitter, type BundleEmitter } from '../bundle-emitter/emitter.ts';
import { createRegistryClient, type RegistryClient } from '../bundle-emitter/registry/registry-client.ts';
import {
    createRegistryJavaScriptObjectNotationFetch,
    withRegistryTransport
} from '../bundle-emitter/registry/registry-transport.ts';
import { createPackEmitter, type PackEmitter } from '../pack-emitter/pack-emitter.ts';
import { createVendorMaterializer, type VendorMaterializer } from '../vendor-materializer/vendor-materializer.ts';
import {
    getContinuousIntegrationRepositoryAddress,
    type ContinuousIntegrationEnvironment
} from '../bundle-emitter/repository-coherence.ts';
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
import {
    createPublishedArtifactSmokeGate,
    type PublishedArtifactSmokeGateDependencies,
    type SmokeProbeInput
} from '../packtory/published-artifact-smoke-gate.ts';
import type { VersionSourceResolver } from '../packtory/map-configuration.ts';
import { createProgressBroadcaster, type ProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { withStageTimings } from '../report/decorators.ts';
import { createResourceResolver, type ResourceResolver } from '../resource-resolver/resource-resolver.ts';
import { createTarballBuilder } from '../tar/tarball-builder.ts';
import { createZipBuilder } from '../zip/zip-builder.ts';
import { createVersionManager, type VersionManager } from '../version-manager/manager.ts';
import { createClock, type Clock } from '../common/clock.ts';
import { createCurrentGitHeadReader, type CurrentGitHeadReader } from '../git/current-git-head.ts';
import {
    createChildProcessGitCommandExecutor,
    createGitCommandRunner,
    spawnChildProcessGitCommand
} from '../git/git-command.ts';
import * as npmIdentity from '../npm-open-identity-connect-identifier-token-resolver.ts';
import { createLicenseResolver } from '../software-bill-of-materials/license-resolver.ts';
import {
    createSoftwareBillOfMaterialsFileBuilder,
    type SoftwareBillOfMaterialsFileBuilder
} from '../software-bill-of-materials/software-bill-of-materials-file.ts';
import * as inventory from '../software-bill-of-materials/software-bill-of-materials-serializer.ts';
import { createPacktoryToolVersionResolver } from '../software-bill-of-materials/tool-version.ts';

async function importPackageManifest(specifier: string): Promise<unknown> {
    return await import(specifier, { with: { type: 'json' } });
}

function outputErrorMessage(standardOutput: string, standardError: string): string | undefined {
    const standardErrorOutput = standardError.trim();
    const standardOutputOutput = standardOutput.trim();
    if (standardErrorOutput.length > 0) {
        return standardErrorOutput;
    }
    return standardOutputOutput.length > 0 ? standardOutputOutput : undefined;
}

function noOutputImportProbeErrorMessage(error: ExecuteFileException, timeoutMilliseconds: number): string {
    if (error.killed === true && error.signal === 'SIGTERM') {
        return `Import probe timed out after ${String(timeoutMilliseconds)} ms without output.`;
    }
    if (error.code !== undefined && error.code !== null) {
        return `Import probe exited with code ${String(error.code)} without output.`;
    }
    if (error.signal !== undefined) {
        return `Import probe exited from signal ${error.signal} without output.`;
    }
    return error.message;
}

function importProbeErrorMessage(
    error: ExecuteFileException,
    standardOutput: string,
    standardError: string,
    timeoutMilliseconds: number
): string {
    return outputErrorMessage(standardOutput, standardError) ??
        noOutputImportProbeErrorMessage(error, timeoutMilliseconds);
}

async function runImportProbe(input: SmokeProbeInput): Promise<void> {
    const script = `
        try {
            await import(${JSON.stringify(input.specifier)});
        } catch (error) {
            console.error(error instanceof Error ? error.stack ?? error.message : String(error));
            process.exitCode = 1;
        }
    `;
    return new Promise(function (resolve, reject) {
        executeFile(
            process.execPath,
            [ '--experimental-strip-types', '--enable-source-maps', '--input-type=module', '-e', script ],
            { cwd: input.cwd, encoding: 'utf8', timeout: input.timeoutMilliseconds },
            function (error, standardOutput, standardError) {
                if (error === null) {
                    resolve();
                    return;
                }
                reject(
                    new Error(importProbeErrorMessage(error, standardOutput, standardError, input.timeoutMilliseconds))
                );
            }
        );
    });
}

async function linkDirectory(
    sourcePath: string,
    targetPath: string,
    type: PublishedArtifactSmokeGateDependencies['dependencyLinkType']
): Promise<void> {
    await fileSystem.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fileSystem.promises.symlink(sourcePath, targetPath, type);
}

async function createTemporaryFolder(prefix: string): Promise<string> {
    return await fileSystem.promises.mkdtemp(path.join(temporaryDirectory(), prefix));
}

async function removeFolder(folderPath: string): Promise<void> {
    await fileSystem.promises.rm(folderPath, { recursive: true, force: true });
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
    readonly continuousIntegrationEnvironment: ContinuousIntegrationEnvironment;
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
        npmFetch: createRegistryJavaScriptObjectNotationFetch({ npmFetch, resolveProxy: getProxyForAddress, clock }),
        async publish(manifest, tarData, publishOptions) {
            return withRegistryTransport(
                { resolveProxy: getProxyForAddress, clock },
                publishOptions ?? {},
                async function (requestOptions) {
                    return publish(manifest, tarData, requestOptions);
                }
            );
        },
        fetch,
        clock,
        resolveIdentifierToken: npmIdentity.createNpmOpenIdentityConnectIdentifierTokenResolver({
            fetch,
            getEnvironmentVariable
        }),
        promptForOneTimePassword: options.promptForOneTimePassword
    });
}

function buildSoftwareBillOfMaterialsFileBuilder(fileManager: FileManager): SoftwareBillOfMaterialsFileBuilder {
    return createSoftwareBillOfMaterialsFileBuilder({
        licenseResolver: createLicenseResolver({ fileManager }),
        softwareBillOfMaterialsSerializer: inventory.createSoftwareBillOfMaterialsSerializer(),
        toolVersionProvider: createPacktoryToolVersionResolver({ importPackageManifest }),
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
        continuousIntegrationRepositoryAddress: getContinuousIntegrationRepositoryAddress(
            options.continuousIntegrationEnvironment
        ),
        readCurrentGitHead
    });
}

function createDeadCodeEliminationProject(hostFileSystem: FileSystemHost): Project {
    return new Project({
        compilerOptions: {
            allowJs: true,
            module: ModuleKind.Node16,
            esModuleInterop: true,
            noLib: true,
            target: ScriptTarget.ES2022,
            moduleResolution: ModuleResolutionKind.Node16
        },
        skipLoadingLibFiles: true,
        fileSystem: hostFileSystem
    });
}

function buildDeadCodeEliminator(progressBroadcaster: ProgressBroadcaster): DeadCodeEliminator {
    return createDeadCodeEliminator({
        progressBroadcaster: progressBroadcaster.provider,
        trace: undefined,
        createProject() {
            return createDeadCodeEliminationProject(new RealFileSystemHost());
        }
    });
}

type CompositionParts = {
    readonly fileManager: FileManager;
    readonly progressBroadcaster: ProgressBroadcaster;
    readonly artifactsBuilder: ArtifactsBuilder;
    readonly bundleEmitter: BundleEmitter;
    readonly resourceResolver: ResourceResolver;
    readonly softwareBillOfMaterialsFileBuilder: SoftwareBillOfMaterialsFileBuilder;
    readonly deadCodeEliminator: DeadCodeEliminator;
    readonly readCurrentGitHead: CurrentGitHeadReader;
    readonly repositoryFolder: string;
};

function buildCompositionParts(options: PackageProcessorCompositionOptions): CompositionParts {
    const repositoryFolder = options.repositoryFolder ?? process.cwd();
    const fileManager = createFileManager({ hostFileSystem: fileSystem.promises });
    const runGitCommand = createGitCommandRunner(createChildProcessGitCommandExecutor(spawnChildProcessGitCommand));
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
        softwareBillOfMaterialsFileBuilder: buildSoftwareBillOfMaterialsFileBuilder(fileManager),
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
        softwareBillOfMaterialsFileBuilder: parts.softwareBillOfMaterialsFileBuilder,
        deadCodeEliminator: parts.deadCodeEliminator,
        fileManager: parts.fileManager,
        publishedArtifactSmokeGate: createPublishedArtifactSmokeGate({
            createProject() {
                return createDeadCodeEliminationProject(new InMemoryFileSystemHost());
            },
            collectContents: parts.artifactsBuilder.collectContents,
            fileManager: parts.fileManager,
            createTemporaryFolder,
            removeFolder,
            linkDirectory,
            runImportProbe,
            dependencyLinkType: process.platform === 'win32' ? 'junction' : 'dir',
            repositoryFolder: parts.repositoryFolder
        }),
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
