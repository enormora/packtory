import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { RealFileSystemHost } from '@ts-morph/common';
import { publish } from 'libnpmpublish';
import npmFetch from 'npm-registry-fetch';
import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget } from 'ts-morph';
import { createArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import { createBundleEmitter } from '../bundle-emitter/emitter.ts';
import { createRegistryClient } from '../bundle-emitter/registry-client.ts';
import { getCiRepositoryUrl, type CiEnvironment } from '../bundle-emitter/repository-coherence.ts';
import { createDeadCodeEliminator } from '../dead-code-eliminator/eliminator.ts';
import { createDependencyScanner, type DependencyScanner } from '../dependency-scanner/scanner.ts';
import { getReferencedSourceFiles } from '../dependency-scanner/source-file-references.ts';
import { createSourceMapFileLocator } from '../dependency-scanner/source-map-file-locator.ts';
import { createFileSystemAdapters } from '../dependency-scanner/typescript-file-host.ts';
import { createTypescriptProjectAnalyzer } from '../dependency-scanner/typescript-project-analyzer.ts';
import { createFileManager, type FileManager } from '../file-manager/file-manager.ts';
import { createBundleLinker } from '../linker/linker.ts';
import { createPackageProcessor, type PackageProcessor } from '../packtory/package-processor.ts';
import { createProgressBroadcaster, type ProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { withStageTimings } from '../report/decorators.ts';
import { createResourceResolver } from '../resource-resolver/resource-resolver.ts';
import { createTarballBuilder } from '../tar/tarball-builder.ts';
import { createVersionManager } from '../version-manager/manager.ts';
import { createClock, type Clock } from '../common/clock.ts';
import { createNpmOidcIdTokenResolver } from '../npm-oidc-id-token-resolver.ts';
import { createLicenseResolver } from '../sbom/license-resolver.ts';
import { createSbomFileBuilder } from '../sbom/sbom-file.ts';
import { createSbomSerializer } from '../sbom/sbom-serializer.ts';
import { createPacktoryToolVersionResolver } from '../sbom/tool-version.ts';

const localRequire = createRequire(import.meta.url);
const packtoryWorkspacePackageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));

function tryResolvePackagePath(specifier: string): string | undefined {
    try {
        return localRequire.resolve(specifier);
    } catch {
        return undefined;
    }
}

export type PackageProcessorComposition = {
    readonly packageProcessor: PackageProcessor;
    readonly progressBroadcaster: ProgressBroadcaster;
    readonly deadCodeEliminator: ReturnType<typeof createDeadCodeEliminator>;
};

export type PackageProcessorCompositionOptions = {
    readonly promptForOneTimePassword?: (() => Promise<string | undefined>) | undefined;
    readonly ciEnvironment: CiEnvironment;
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
        getReferencedSourceFiles,
        fileSystemAdapters
    });
    return createDependencyScanner({ sourceMapFileLocator, typescriptProjectAnalyzer });
}

function buildRegistryClient(
    options: PackageProcessorCompositionOptions,
    clock: Clock
): ReturnType<typeof createRegistryClient> {
    return createRegistryClient({
        npmFetch,
        publish,
        fetch: globalThis.fetch,
        clock,
        resolveIdToken: createNpmOidcIdTokenResolver({
            fetch: globalThis.fetch,
            getEnvironmentVariable
        }),
        promptForOneTimePassword: options.promptForOneTimePassword
    });
}

function buildSbomFileBuilder(fileManager: FileManager): ReturnType<typeof createSbomFileBuilder> {
    return createSbomFileBuilder({
        licenseResolver: createLicenseResolver({ fileManager }),
        sbomSerializer: createSbomSerializer(),
        toolVersionProvider: createPacktoryToolVersionResolver({
            fileManager,
            resolvePackagePath: tryResolvePackagePath,
            fallbackPackageJsonPath: packtoryWorkspacePackageJsonPath
        }),
        projectFolder: process.cwd()
    });
}

function buildBundleEmitter(
    options: PackageProcessorCompositionOptions,
    fileManager: FileManager,
    progressBroadcaster: ProgressBroadcaster
): ReturnType<typeof createBundleEmitter> {
    const registryClient = buildRegistryClient(options, createClock());
    const artifactsBuilder = createArtifactsBuilder({
        fileManager,
        tarballBuilder: createTarballBuilder(),
        progressBroadcaster: progressBroadcaster.provider
    });
    return createBundleEmitter({
        registryClient,
        artifactsBuilder,
        ciRepositoryUrl: getCiRepositoryUrl(options.ciEnvironment)
    });
}

export function buildPackageProcessorComposition(
    options: PackageProcessorCompositionOptions
): PackageProcessorComposition {
    const fileManager = createFileManager({ hostFileSystem: fs.promises });
    const dependencyScanner = createDependencyScannerWith(fileManager);
    const progressBroadcaster = createProgressBroadcaster();
    const bundleEmitter = buildBundleEmitter(options, fileManager, progressBroadcaster);
    const resourceResolver = createResourceResolver({ fileManager, dependencyScanner });
    const sbomFileBuilder = buildSbomFileBuilder(fileManager);
    const deadCodeEliminator = createDeadCodeEliminator({
        progressBroadcaster: progressBroadcaster.provider,
        createProject: () => {
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

    const basePackageProcessor = createPackageProcessor({
        progressBroadcaster: progressBroadcaster.provider,
        versionManager: createVersionManager({ progressBroadcaster: progressBroadcaster.provider }),
        bundleEmitter,
        linker: createBundleLinker(),
        resourceResolver,
        sbomFileBuilder,
        deadCodeEliminator
    });
    const packageProcessor = withStageTimings(basePackageProcessor, progressBroadcaster.provider);

    return { packageProcessor, progressBroadcaster, deadCodeEliminator };
}
