import path from 'node:path';
import { isBuiltin } from 'node:module';
import { ts, type SourceFile, type StringLiteral } from 'ts-morph';
import { findPackageOwnedAssetFilePath } from './package-owned-asset-file-path.ts';

export const moduleReferenceKind = {
    externalPackage: 'external-package',
    generatedManifest: 'generated-manifest',
    localAsset: 'local-asset',
    localCode: 'local-code'
} as const;

type ExternalPackageReference = {
    readonly kind: typeof moduleReferenceKind.externalPackage;
    readonly packageName: string;
};

type GeneratedManifestReference = {
    readonly kind: typeof moduleReferenceKind.generatedManifest;
    readonly filePath: string;
};

type LocalAssetReference = {
    readonly kind: typeof moduleReferenceKind.localAsset;
    readonly filePath: string;
};

type LocalCodeReference = {
    readonly kind: typeof moduleReferenceKind.localCode;
    readonly filePath: string;
};

export type ModuleReference =
    | ExternalPackageReference
    | GeneratedManifestReference
    | LocalAssetReference
    | LocalCodeReference;

function hashImportPrefix(): string {
    return '#';
}

function typesDependenciesFolderPath(): string {
    return `${path.sep}node_modules${path.sep}@types${path.sep}`;
}

function isRelativeOrAbsoluteSpecifier(specifier: string): boolean {
    return specifier.startsWith('.') || path.isAbsolute(specifier);
}

function isHashSpecifier(specifier: string): boolean {
    return specifier.startsWith(hashImportPrefix());
}

function packageNameFromSpecifier(specifier: string): string {
    if (specifier.startsWith('@')) {
        const [scope, name] = specifier.split('/');
        if (name === undefined) {
            throw new Error(`Invalid package specifier "${specifier}"`);
        }
        return `${scope}/${name}`;
    }

    const separatorIndex = specifier.indexOf('/');
    return separatorIndex === -1 ? specifier : specifier.slice(0, separatorIndex);
}

function typesPackageNameFromResolvedPath(resolvedFilePath: string): string | undefined {
    const normalizedPath = path.normalize(resolvedFilePath);
    const folderPath = typesDependenciesFolderPath();
    const folderIndex = normalizedPath.lastIndexOf(folderPath);
    if (folderIndex === -1) {
        return undefined;
    }

    const relativePath = normalizedPath.slice(folderIndex + folderPath.length);
    const [packageName] = relativePath.split(path.sep);
    return `@types/${packageName}`;
}

function externalPackageNameForResolvedImport(
    importValue: string,
    resolvedFilePath: string,
    containingSourceFile: Readonly<SourceFile>
): string {
    if (containingSourceFile.getFilePath().endsWith('.d.ts')) {
        return typesPackageNameFromResolvedPath(resolvedFilePath) ?? packageNameFromSpecifier(importValue);
    }

    return packageNameFromSpecifier(importValue);
}

function isLocalAssetReference(filePath: string): boolean {
    const extension = path.extname(filePath);
    return extension === '.json' || extension === '.wasm';
}

function classifyLocalReference(resolvedFilePath: string, packageJsonPath: string): ModuleReference {
    if (path.resolve(resolvedFilePath) === path.resolve(packageJsonPath)) {
        return { kind: moduleReferenceKind.generatedManifest, filePath: resolvedFilePath };
    }

    if (isLocalAssetReference(resolvedFilePath)) {
        return { kind: moduleReferenceKind.localAsset, filePath: resolvedFilePath };
    }

    return { kind: moduleReferenceKind.localCode, filePath: resolvedFilePath };
}

function resolvedModuleForImport(
    importValue: string,
    containingSourceFile: Readonly<SourceFile>
): Readonly<ts.ResolvedModule | undefined> {
    const project = containingSourceFile.getProject();
    return ts.resolveModuleName(
        importValue,
        containingSourceFile.getFilePath(),
        project.getCompilerOptions(),
        project.getModuleResolutionHost()
    ).resolvedModule;
}

export function resolveSourceFileForLiteral(
    literal: StringLiteral,
    containingSourceFile: Readonly<SourceFile>
): Readonly<SourceFile | undefined> {
    const project = containingSourceFile.getProject();
    const resolvedModule = resolvedModuleForImport(literal.getLiteralValue(), containingSourceFile);

    if (resolvedModule !== undefined) {
        const resolvedFilePath = resolvedModule.resolvedFileName;
        return project.getSourceFile(resolvedFilePath);
    }

    return undefined;
}

function resolveWasmReference(
    importValue: string,
    containingSourceFile: Readonly<SourceFile>,
    packageJsonPath: string
): Readonly<ModuleReference | undefined> {
    if (isRelativeOrAbsoluteSpecifier(importValue)) {
        const moduleResolutionHost = containingSourceFile.getProject().getModuleResolutionHost();
        const candidatePath = path.resolve(path.dirname(containingSourceFile.getFilePath()), importValue);
        return moduleResolutionHost.fileExists(candidatePath)
            ? classifyLocalReference(candidatePath, packageJsonPath)
            : undefined;
    }

    packageNameFromSpecifier(importValue);
    const moduleResolutionHost = containingSourceFile.getProject().getModuleResolutionHost();
    const resolvedFilePath = findPackageOwnedAssetFilePath(
        importValue,
        path.dirname(containingSourceFile.getFilePath()),
        (candidatePath) => {
            return moduleResolutionHost.fileExists(candidatePath);
        }
    );
    if (resolvedFilePath === undefined) {
        return undefined;
    }

    return {
        kind: moduleReferenceKind.externalPackage,
        packageName: packageNameFromSpecifier(importValue)
    };
}

function resolveModuleReferenceForImport(
    importValue: string,
    containingSourceFile: Readonly<SourceFile>,
    packageJsonPath: string
): Readonly<ModuleReference | undefined> {
    const resolvedModule = resolvedModuleForImport(importValue, containingSourceFile);
    if (resolvedModule !== undefined) {
        if (!isRelativeOrAbsoluteSpecifier(importValue) && !isHashSpecifier(importValue)) {
            return {
                kind: moduleReferenceKind.externalPackage,
                packageName: externalPackageNameForResolvedImport(
                    importValue,
                    resolvedModule.resolvedFileName,
                    containingSourceFile
                )
            };
        }

        return classifyLocalReference(resolvedModule.resolvedFileName, packageJsonPath);
    }

    return importValue.endsWith('.wasm')
        ? resolveWasmReference(importValue, containingSourceFile, packageJsonPath)
        : undefined;
}

export function getReferencedModules(
    sourceFile: Readonly<SourceFile>,
    packageJsonPath: string
): readonly Readonly<ModuleReference>[] {
    const referencedModules: ModuleReference[] = [];

    for (const literal of sourceFile.getImportStringLiterals()) {
        const importValue = literal.getLiteralValue();
        const referencedModule = resolveModuleReferenceForImport(importValue, sourceFile, packageJsonPath);

        if (referencedModule !== undefined) {
            referencedModules.push(referencedModule);
        } else if (!isBuiltin(importValue)) {
            throw new Error(`Failed to resolve import "${importValue}" in file "${sourceFile.getFilePath()}"`);
        }
    }

    return referencedModules;
}
