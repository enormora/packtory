import path from 'node:path';
import type { SourceFile } from 'ts-morph';
import {
    packageTypeForResolvedFilePath,
    resolveTypescriptModuleFilePath
} from '../dependency-scanner/typescript-module-resolution.ts';
import type { ArtifactModuleReference } from '../resource-resolver/resolved-bundle.ts';

export type RuntimeModuleResolver = (
    moduleSpecifier: string,
    containingSourceFile: SourceFile
) => SourceFile | undefined;

export type RuntimeModuleOrigin = {
    readonly sourceFile: Readonly<SourceFile>;
    readonly inputFilePath: string;
    readonly moduleReferences: readonly ArtifactModuleReference[];
};

function isRuntimeModule(filePath: string, containingSourceFile: SourceFile): boolean {
    const extension = path.extname(filePath);
    if (extension === '.mjs') {
        return true;
    }
    return extension === '.js' &&
        packageTypeForResolvedFilePath({ filePath, containingSourceFile }) === 'module';
}

function resolveRuntimeModuleFrom(
    moduleSpecifier: string,
    containingSourceFile: SourceFile,
    containingFilePath: string
): SourceFile | undefined {
    const filePath = resolveTypescriptModuleFilePath({
        moduleSpecifier,
        containingSourceFile,
        containingFilePath,
        resolutionMode: 'runtime'
    });
    if (filePath === undefined) {
        return undefined;
    }
    if (!isRuntimeModule(filePath, containingSourceFile)) {
        return undefined;
    }
    const project = containingSourceFile.getProject();
    return project.getSourceFile(filePath) ?? project.addSourceFileAtPathIfExists(filePath);
}

export function resolveRuntimeModule(
    moduleSpecifier: string,
    containingSourceFile: SourceFile
): SourceFile | undefined {
    return resolveRuntimeModuleFrom(moduleSpecifier, containingSourceFile, containingSourceFile.getFilePath());
}

export function createRuntimeModuleResolver(files: readonly RuntimeModuleOrigin[]): RuntimeModuleResolver {
    const origins = new Map(files.map(function (file) {
        return [ file.sourceFile, file ] as const;
    }));
    return function (moduleSpecifier, containingSourceFile) {
        const origin = origins.get(containingSourceFile);
        if (origin === undefined) {
            return resolveRuntimeModule(moduleSpecifier, containingSourceFile);
        }
        const reference = origin.moduleReferences.find(function (candidate) {
            return candidate.emittedSpecifier === moduleSpecifier;
        });
        return reference?.type === 'external-package'
            ? resolveRuntimeModuleFrom(reference.sourceSpecifier, containingSourceFile, origin.inputFilePath)
            : undefined;
    };
}
