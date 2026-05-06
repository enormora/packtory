import fs from 'node:fs';
import { RealFileSystemHost } from '@ts-morph/common';
import { publish } from 'libnpmpublish';
import npmFetch from 'npm-registry-fetch';
import { Project } from 'ts-morph';
import { createArtifactsBuilder } from '../artifacts/artifacts-builder.ts';
import { createBundleEmitter } from '../bundle-emitter/emitter.ts';
import { createRegistryClient } from '../bundle-emitter/registry-client.ts';
import { createDependencyScanner, type DependencyScanner } from '../dependency-scanner/scanner.ts';
import { getReferencedSourceFiles } from '../dependency-scanner/source-file-references.ts';
import { createSourceMapFileLocator } from '../dependency-scanner/source-map-file-locator.ts';
import { createFileSystemAdapters } from '../dependency-scanner/typescript-file-host.ts';
import { createTypescriptProjectAnalyzer } from '../dependency-scanner/typescript-project-analyzer.ts';
import { createFileManager, type FileManager } from '../file-manager/file-manager.ts';
import { createBundleLinker } from '../linker/linker.ts';
import { createPackageProcessor, type PackageProcessor } from '../packtory/package-processor.ts';
import { createProgressBroadcaster, type ProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { createResourceResolver } from '../resource-resolver/resource-resolver.ts';
import { createTarballBuilder } from '../tar/tarball-builder.ts';
import { createVersionManager } from '../version-manager/manager.ts';

export type PackageProcessorComposition = {
    readonly packageProcessor: PackageProcessor;
    readonly progressBroadcaster: ProgressBroadcaster;
};

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

export function buildPackageProcessorComposition(): PackageProcessorComposition {
    const fileManager = createFileManager({ hostFileSystem: fs.promises });
    const dependencyScanner = createDependencyScannerWith(fileManager);
    const registryClient = createRegistryClient({ npmFetch, publish });
    const artifactsBuilder = createArtifactsBuilder({ fileManager, tarballBuilder: createTarballBuilder() });
    const progressBroadcaster = createProgressBroadcaster();
    const bundleEmitter = createBundleEmitter({ registryClient, artifactsBuilder });
    const resourceResolver = createResourceResolver({ fileManager, dependencyScanner });

    const packageProcessor = createPackageProcessor({
        progressBroadcaster: progressBroadcaster.provider,
        versionManager: createVersionManager(),
        bundleEmitter,
        linker: createBundleLinker(),
        resourceResolver
    });

    return { packageProcessor, progressBroadcaster };
}
