import fs from 'node:fs';
import npmFetch from 'npm-registry-fetch';
import { publish } from 'libnpmpublish';
import { createFileManager } from '../../artifacts/file-manager.js';
import { createPublisher } from '../../publisher/publisher.js';
import { bundler } from '../bundler/bundler.entry-point.js';
import { createRegistryClient } from '../../publisher/registry-client.js';
import { createArtifactsBuilder } from '../../artifacts/artifacts-builder.js';
import { createProgressBroadcaster } from '../../progress/progress-broadcaster.js';
import { createScheduler } from '../../packtory/scheduler.js';
import { createPacktory } from '../../packtory/packtory.js';
import { createTarballBuilder } from '../../tar/tarball-builder.js';

const fileManager = createFileManager({ hostFileSystem: fs.promises });
const registryClient = createRegistryClient({ npmFetch, publish });
const artifactsBuilder = createArtifactsBuilder({ fileManager, tarballBuilder: createTarballBuilder() });
const progressBroadcaster = createProgressBroadcaster();
const publisher = createPublisher({
    progressBroadcaster: progressBroadcaster.provider,
    bundler,
    registryClient,
    artifactsBuilder
});
const scheduler = createScheduler({
    progressBroadcastProvider: progressBroadcaster.provider
});

const packtory = createPacktory({
    scheduler,
    publisher
});

export const { buildAndPublishAll } = packtory;
export const progressBroadcastConsumer = progressBroadcaster.consumer;

export type { PacktoryConfig } from '../../config/config.js';
export type { PublishAllResult } from '../../packtory/packtory.js';
