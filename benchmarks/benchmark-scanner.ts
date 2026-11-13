import { Project, type FileSystemHost } from 'ts-morph';
import type { FileManager } from '../source/file-manager/file-manager.ts';
import {
    createCompilerInputValidator,
    type CompilerInputValidator
} from '../source/dependency-scanner/compiler-input-validator.ts';
import { createDependencyScanner, type DependencyScanner } from '../source/dependency-scanner/scanner.ts';
import { createSharedProjectAnalyzer } from '../source/dependency-scanner/shared-project-analyzer.ts';
import { getReferencedModules } from '../source/dependency-scanner/source-file-references.ts';
import { createSourceMapFileLocator } from '../source/dependency-scanner/source-map-file-locator.ts';

export type BenchmarkScanner = {
    readonly scanner: DependencyScanner;
    readonly inputValidator: CompilerInputValidator;
};

export function createBenchmarkScanner(fileManager: FileManager, fileSystemHost: FileSystemHost): BenchmarkScanner {
    const inputValidator = createCompilerInputValidator(fileManager);
    return {
        inputValidator,
        scanner: createDependencyScanner({
            sourceMapFileLocator: createSourceMapFileLocator({ fileManager }),
            typescriptProjectAnalyzer: createSharedProjectAnalyzer({
                Project,
                getReferencedModules,
                inputValidator,
                fileSystemHost
            })
        })
    };
}
