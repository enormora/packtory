import fs from 'node:fs';
import npmFetch from 'npm-registry-fetch';
import { publish } from 'libnpmpublish';
import { createFileManager } from './artifacts/file-manager.js';
import { createPublisher } from './publisher/publisher.js';
import { bundler } from './bundler.entry-point.js';
import { createRegistryClient } from './publisher/registry-client.js';
import { createArtifactsBuilder } from './artifacts/artifacts-builder.js';

const fileManager = createFileManager({ hostFileSystem: fs.promises });
const registryClient = createRegistryClient({ npmFetch, publish });
const artifactsBuilder = createArtifactsBuilder({ fileManager });

export const publisher = createPublisher({ bundler, registryClient, artifactsBuilder });
