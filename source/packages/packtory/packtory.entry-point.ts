import fs from 'node:fs';
import { RealFileSystemHost } from '@ts-morph/common';
import { publish } from 'libnpmpublish';
import npmFetch from 'npm-registry-fetch';
import { Project } from 'ts-morph';
import { createArtifactsBuilder } from '../../artifacts/artifacts-builder.ts';
import { createBundleEmitter } from '../../bundle-emitter/emitter.ts';
import { createDependencyScanner } from '../../dependency-scanner/scanner.ts';
import { getReferencedSourceFiles } from '../../dependency-scanner/source-file-references.ts';
import { createSourceMapFileLocator } from '../../dependency-scanner/source-map-file-locator.ts';
import { createFileSystemAdapters } from '../../dependency-scanner/typescript-file-host.ts';
import { createTypescriptProjectAnalyzer } from '../../dependency-scanner/typescript-project-analyzer.ts';
import { createFileManager } from '../../file-manager/file-manager.ts';
import { createBundleLinker } from '../../linker/linker.ts';
import { createPackageProcessor } from '../../packtory/package-processor.ts';
import { createPacktory } from '../../packtory/packtory.ts';
import { createScheduler } from '../../packtory/scheduler.ts';
import { createProgressBroadcaster } from '../../progress/progress-broadcaster.ts';
import { createRegistryClient } from '../../bundle-emitter/registry-client.ts';
import { createResourceResolver } from '../../resource-resolver/resource-resolver.ts';
import { createTarballBuilder } from '../../tar/tarball-builder.ts';
import { createVersionManager } from '../../version-manager/manager.ts';

const fileManager = createFileManager({ hostFileSystem: fs.promises });
const sourceMapFileLocator = createSourceMapFileLocator({ fileManager });
const fileSystemAdapters = createFileSystemAdapters({ fileSystemHost: new RealFileSystemHost() });
const typescriptProjectAnalyzer = createTypescriptProjectAnalyzer({
    Project,
    getReferencedSourceFiles,
    fileSystemAdapters
});
const dependencyScanner = createDependencyScanner({ sourceMapFileLocator, typescriptProjectAnalyzer });

const registryClient = createRegistryClient({ npmFetch, publish });
const artifactsBuilder = createArtifactsBuilder({ fileManager, tarballBuilder: createTarballBuilder() });
const progressBroadcaster = createProgressBroadcaster();

const scheduler = createScheduler({
    progressBroadcastProvider: progressBroadcaster.provider
});

const versionManager = createVersionManager();
const bundleEmitter = createBundleEmitter({ registryClient, artifactsBuilder });
const linker = createBundleLinker();
const resourceResolver = createResourceResolver({ fileManager, dependencyScanner });

const packageProcessor = createPackageProcessor({
    progressBroadcaster: progressBroadcaster.provider,
    versionManager,
    bundleEmitter,
    linker,
    resourceResolver
});

const packtory = createPacktory({
    scheduler,
    packageProcessor
});

export const { buildAndPublishAll } = packtory;
export const progressBroadcastConsumer = progressBroadcaster.consumer;

export type { PacktoryConfig } from '../../config/config.js';
export type { PublishAllResult } from '../../packtory/packtory.js';
