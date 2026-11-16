import path from 'node:path';
import { ts as typescript } from 'ts-morph';
import { declarationCompanionCandidates } from '../common/declaration-companion-paths.ts';
import {
    indexPublicModules,
    rootInputFilePaths,
    type PublicModuleIndex
} from '../package-surface/package-surface-index.ts';
import type { BundleSubstitutionSource } from './linked-bundle.ts';

export type SubstitutionSourceIndex = {
    readonly contentBySourcePath: ReadonlyMap<string, BundleSubstitutionSource['contents'][number]>;
    readonly exportsOf: (content: BundleSubstitutionSource['contents'][number]) => ExportDeclarations;
    readonly publicSpecifierFor: (inputFilePath: string) => string | undefined;
    readonly rootPaths: ReadonlySet<string>;
    readonly inputPathsForExport: (
        targetFilePath: string,
        declaration: Readonly<typescript.ExportDeclaration>
    ) => readonly string[];
};

function isDefined<T>(value: T | undefined): value is T {
    return value !== undefined;
}

function exportDeclaration(
    statement: Readonly<typescript.Statement>
): Readonly<typescript.ExportDeclaration> | undefined {
    if (!typescript.isExportDeclaration(statement)) {
        return undefined;
    }
    return statement;
}

function moduleSpecifierText(statement: Readonly<typescript.ExportDeclaration>): string | undefined {
    const { moduleSpecifier } = statement;
    if (moduleSpecifier === undefined) {
        return undefined;
    }
    if (!typescript.isStringLiteral(moduleSpecifier) || !moduleSpecifier.text.startsWith('.')) {
        return undefined;
    }
    return moduleSpecifier.text;
}

function exportDeclarations(content: string): readonly Readonly<typescript.ExportDeclaration>[] {
    const sourceFile = typescript.createSourceFile(
        content,
        content,
        typescript.ScriptTarget.Latest
    );
    return sourceFile
        .statements
        .map(exportDeclaration)
        .filter(isDefined);
}

function exportedTargetPath(currentTargetFilePath: string, specifier: string): string {
    return path.posix.normalize(path.posix.join(path.posix.dirname(currentTargetFilePath), specifier));
}

function exportedInputFilePaths(
    sourcePathByTargetPath: ReadonlyMap<string, string>,
    currentTargetFilePath: string,
    specifier: string
): readonly string[] {
    const targetPath = exportedTargetPath(currentTargetFilePath, specifier);
    const inputFilePaths: string[] = [];
    for (const candidate of [ targetPath, ...declarationCompanionCandidates(targetPath) ]) {
        const inputFilePath = sourcePathByTargetPath.get(candidate);
        if (inputFilePath !== undefined) {
            inputFilePaths.push(inputFilePath);
        }
    }
    return inputFilePaths;
}

export function namedExports(
    declaration: Readonly<typescript.ExportDeclaration>
): readonly Readonly<typescript.ExportSpecifier>[] {
    const { exportClause } = declaration;
    if (exportClause === undefined || !typescript.isNamedExports(exportClause)) {
        return [];
    }
    return Array.from(exportClause.elements);
}

type ExportDeclarations = {
    readonly all: readonly Readonly<typescript.ExportDeclaration>[];
    readonly stars: readonly Readonly<typescript.ExportDeclaration>[];
    readonly named: ReadonlyMap<string | undefined, readonly Readonly<typescript.ExportDeclaration>[]>;
};

function indexExportDeclarations(content: string): ExportDeclarations {
    const all = exportDeclarations(content);
    const names = new Map<string | undefined, typescript.ExportDeclaration[]>();
    for (const declaration of all) {
        for (const specifier of namedExports(declaration)) {
            const matches = names.get(specifier.name.text) ?? [];
            matches.push(declaration);
            names.set(specifier.name.text, matches);
        }
    }
    return {
        all,
        stars: all.filter(function (declaration) {
            return declaration.exportClause === undefined;
        }),
        named: names
    };
}

export function createSubstitutionSourceIndex(bundle: BundleSubstitutionSource): SubstitutionSourceIndex {
    const contentBySourcePath = new Map<string, BundleSubstitutionSource['contents'][number]>();
    const sourcePathByTargetPath = new Map<string, string>();
    for (const content of bundle.contents) {
        contentBySourcePath.set(content.fileDescription.inputFilePath, content);
        sourcePathByTargetPath.set(content.fileDescription.targetFilePath, content.fileDescription.inputFilePath);
    }
    const declarations = new Map<string, ExportDeclarations>();
    let publicModules: PublicModuleIndex | null = null;
    return {
        contentBySourcePath,
        rootPaths: new Set(Object.values(bundle.roots).flatMap(rootInputFilePaths)),
        exportsOf(content) {
            const filePath = content.fileDescription.inputFilePath;
            const found = declarations.get(filePath) ?? indexExportDeclarations(content.fileDescription.content);
            declarations.set(filePath, found);
            return found;
        },
        inputPathsForExport(targetFilePath, declaration) {
            return exportedInputFilePaths(
                sourcePathByTargetPath,
                targetFilePath,
                moduleSpecifierText(declaration) ?? ''
            );
        },
        publicSpecifierFor(inputFilePath) {
            publicModules = publicModules ?? indexPublicModules(bundle);
            return publicModules.specifierByInputFilePath.get(inputFilePath);
        }
    };
}
