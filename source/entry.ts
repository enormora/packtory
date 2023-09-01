import {createBundler} from './bundler/bundler.js';
import {createDependencyScanner} from './dependency-scanner/scanner.js';
import {createSourceMapFileLocator} from './dependency-scanner/source-map-file-locator.js';
import fs from 'node:fs';
import {Project} from 'ts-morph';
import {createTypescriptProjectAnalyzer} from './dependency-scanner/typescript-project-analyzer.js';
import {getReferencedSourceFiles} from './dependency-scanner/source-file-references.js';

const sourceMapFileLocator = createSourceMapFileLocator({
    readFile: fs.promises.readFile,
    checkFileAccess: fs.promises.access
});
const typescriptProjectAnalyzer = createTypescriptProjectAnalyzer({Project, getReferencedSourceFiles});
const dependencyScanner = createDependencyScanner({sourceMapFileLocator, typescriptProjectAnalyzer});
export const bundler = createBundler({dependencyScanner});

