import path from 'node:path';
import { isBuiltin } from 'node:module';
import { isDefined } from 'remeda';
import { ts, type SourceFile, type StringLiteral } from 'ts-morph';
import { findPackageOwnedAssetFilePath } from './package-owned-asset-file-path.ts';

type ExternalPackageReference = {
    readonly kind: 'external-package';
    readonly packageName: string;
};

type GeneratedManifestReference = {
    readonly kind: 'generated-manifest';
    readonly filePath: string;
};

type LocalAssetReference = {
    readonly kind: 'local-asset';
    readonly filePath: string;
};

type LocalCodeReference = {
    readonly kind: 'local-code';
    readonly filePath: string;
};

export type ModuleReference =
    | ExternalPackageReference
    | GeneratedManifestReference
    | LocalAssetReference
    | LocalCodeReference;

function isNodeModulesPath(filePath: string): boolean {
    return filePath.includes('/node_modules/');
}

function extractModuleName(nodeModulePath: string): string {
    const prefix = '/node_modules/';
    const packagePath = nodeModulePath.slice(nodeModulePath.lastIndexOf(prefix) + prefix.length);
    if (!packagePath.startsWith('@')) {
        return packagePath.slice(0, `${packagePath}/`.indexOf('/'));
    }

    const [scope, name] = packagePath.split('/');
    return `${scope}/${name}`;
}

function isRelativeOrAbsoluteSpecifier(specifier: string): boolean {
    return specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/');
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

function resolvePackageOwnedWasmFilePath(
    literal: StringLiteral,
    containingSourceFile: Readonly<SourceFile>
): { readonly filePath: string; readonly packageName: string } | undefined {
    const importValue = literal.getLiteralValue();
    const packageName = packageNameFromSpecifier(importValue);
    const moduleResolutionHost = containingSourceFile.getProject().getModuleResolutionHost();
    const filePath = findPackageOwnedAssetFilePath(
        importValue,
        path.dirname(containingSourceFile.getFilePath()),
        (candidatePath) => {
            return moduleResolutionHost.fileExists(candidatePath);
        }
    );
    if (filePath !== undefined) {
        return { filePath, packageName };
    }

    return undefined;
}

function resolveLocalWasmFilePath(
    literal: StringLiteral,
    containingSourceFile: Readonly<SourceFile>
): string | undefined {
    const importValue = literal.getLiteralValue();
    const candidatePath = path.resolve(path.dirname(containingSourceFile.getFilePath()), importValue);
    const moduleResolutionHost = containingSourceFile.getProject().getModuleResolutionHost();

    return moduleResolutionHost.fileExists(candidatePath) ? candidatePath : undefined;
}

function classifyLocalReference(resolvedFilePath: string, packageJsonPath: string): ModuleReference {
    if (path.resolve(resolvedFilePath) === path.resolve(packageJsonPath)) {
        return { kind: 'generated-manifest', filePath: resolvedFilePath };
    }

    const extension = path.extname(resolvedFilePath);
    if (extension === '.json' || extension === '.wasm') {
        return { kind: 'local-asset', filePath: resolvedFilePath };
    }

    return { kind: 'local-code', filePath: resolvedFilePath };
}

function resolvedModuleForLiteral(
    literal: StringLiteral,
    containingSourceFile: Readonly<SourceFile>
): Readonly<ts.ResolvedModule | undefined> {
    const project = containingSourceFile.getProject();
    return ts.resolveModuleName(
        literal.getLiteralValue(),
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
    const resolvedModule = resolvedModuleForLiteral(literal, containingSourceFile);

    if (resolvedModule !== undefined) {
        const resolvedFilePath = resolvedModule.resolvedFileName;
        return project.getSourceFile(resolvedFilePath);
    }

    return undefined;
}

function resolvedModuleBasedReference(
    literal: StringLiteral,
    containingSourceFile: Readonly<SourceFile>,
    packageJsonPath: string
): Readonly<ModuleReference | undefined> {
    const resolvedModule = resolvedModuleForLiteral(literal, containingSourceFile);
    if (resolvedModule === undefined) {
        return undefined;
    }

    const resolvedFilePath = resolvedModule.resolvedFileName;
    if (isNodeModulesPath(resolvedFilePath)) {
        return {
            kind: 'external-package',
            packageName: extractModuleName(resolvedFilePath)
        };
    }

    return classifyLocalReference(resolvedFilePath, packageJsonPath);
}

function fallbackModuleReference(
    literal: StringLiteral,
    containingSourceFile: Readonly<SourceFile>,
    packageJsonPath: string
): Readonly<ModuleReference | undefined> {
    const importValue = literal.getLiteralValue();
    if (!importValue.endsWith('.wasm')) {
        return undefined;
    }

    if (isRelativeOrAbsoluteSpecifier(importValue)) {
        const wasmFilePath = resolveLocalWasmFilePath(literal, containingSourceFile);
        return wasmFilePath === undefined ? undefined : classifyLocalReference(wasmFilePath, packageJsonPath);
    }

    const packageOwnedWasm = resolvePackageOwnedWasmFilePath(literal, containingSourceFile);
    if (packageOwnedWasm === undefined) {
        return undefined;
    }

    return {
        kind: 'external-package',
        packageName: packageOwnedWasm.packageName
    };
}

function resolveModuleReferenceForLiteral(
    literal: StringLiteral,
    containingSourceFile: Readonly<SourceFile>,
    packageJsonPath: string
): Readonly<ModuleReference | undefined> {
    const directReference = resolvedModuleBasedReference(literal, containingSourceFile, packageJsonPath);
    if (directReference !== undefined) {
        return directReference;
    }

    return fallbackModuleReference(literal, containingSourceFile, packageJsonPath);
}

export function getReferencedModules(
    sourceFile: Readonly<SourceFile>,
    packageJsonPath: string
): readonly Readonly<ModuleReference>[] {
    const importStringLiterals = sourceFile.getImportStringLiterals();
    return importStringLiterals
        .map((literal) => {
            const referencedModule = resolveModuleReferenceForLiteral(literal, sourceFile, packageJsonPath);

            if (referencedModule === undefined) {
                const importValue = literal.getLiteralValue();

                if (isBuiltin(importValue)) {
                    return undefined;
                }

                const message = `Failed to resolve import "${importValue}" in file "${sourceFile.getFilePath()}"`;

                throw new Error(message);
            }

            return referencedModule;
        })
        .filter(isDefined);
}
