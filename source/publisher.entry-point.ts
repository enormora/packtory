import fs from 'node:fs';
import npmFetch from 'npm-registry-fetch';
import { publish } from 'libnpmpublish';
import { createFileManager } from './artifacts/file-manager.js';
import { createPublisher } from './publisher/publisher.js';
import { bundler } from './bundler.entry-point.js';
import { createRegistryClient } from './publisher/registry-client.js';
import { createArtifactsBuilder } from './artifacts/artifacts-builder.js';
import { createProgressBroadcaster } from './progress/progress-broadcaster.js';

const fileManager = createFileManager({ hostFileSystem: fs.promises });
const registryClient = createRegistryClient({ npmFetch, publish });
const artifactsBuilder = createArtifactsBuilder({ fileManager });
const progressBroadcaster = createProgressBroadcaster();

export const publisher = createPublisher({
    progressBroadcaster: progressBroadcaster.provider,
    bundler,
    registryClient,
    artifactsBuilder
});
