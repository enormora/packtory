import path from 'node:path';
import type { SourceFile } from 'ts-morph';
import {
    packageTypeForResolvedFilePath,
    resolveTypescriptModuleFilePath
} from '../dependency-scanner/typescript-module-resolution.ts';

function packageTypeFor(filePath: string, containingSourceFile: Readonly<SourceFile>): string | undefined {
    return packageTypeForResolvedFilePath({ filePath, containingSourceFile });
}

function isRuntimeSource(filePath: string, containingSourceFile: Readonly<SourceFile>): boolean {
    const extension = path.extname(filePath);
    return extension === '.mjs' || extension === '.js' && packageTypeFor(filePath, containingSourceFile) === 'module';
}

function sourceFileAt(filePath: string, containingSourceFile: Readonly<SourceFile>): SourceFile | undefined {
    const project = containingSourceFile.getProject();
    return project.getSourceFile(filePath) ?? project.addSourceFileAtPathIfExists(filePath);
}

export function resolvedRuntimeSourceFile(
    moduleSpecifier: string,
    containingSourceFile: Readonly<SourceFile>
): SourceFile | undefined {
    const filePath = resolveTypescriptModuleFilePath({
        moduleSpecifier,
        containingSourceFile,
        resolutionMode: 'runtime'
    });
    return filePath !== undefined && isRuntimeSource(filePath, containingSourceFile)
        ? sourceFileAt(filePath, containingSourceFile)
        : undefined;
}
