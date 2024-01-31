import fs from 'node:fs';
import { Project } from 'ts-morph';
import { RealFileSystemHost } from '@ts-morph/common';
import { createBundler } from '../../bundler/bundler.js';
import { createDependencyScanner } from '../../dependency-scanner/scanner.js';
import { createSourceMapFileLocator } from '../../dependency-scanner/source-map-file-locator.js';
import { createTypescriptProjectAnalyzer } from '../../dependency-scanner/typescript-project-analyzer.js';
import { getReferencedSourceFiles } from '../../dependency-scanner/source-file-references.js';
import { createFileManager } from '../../artifacts/file-manager.js';
import { createFileSystemAdapters } from '../../dependency-scanner/typescript-file-host.js';

const fileManager = createFileManager({ hostFileSystem: fs.promises });
const sourceMapFileLocator = createSourceMapFileLocator({ fileManager });
const fileSystemAdapters = createFileSystemAdapters({ fileSystemHost: new RealFileSystemHost() });
const typescriptProjectAnalyzer = createTypescriptProjectAnalyzer({
    Project,
    getReferencedSourceFiles,
    fileSystemAdapters
});
const dependencyScanner = createDependencyScanner({ sourceMapFileLocator, typescriptProjectAnalyzer });
export const bundler = createBundler({ dependencyScanner });
