import {
    Node as TsMorphNode,
    type ExportDeclaration,
    type SourceFile,
    type Statement
} from 'ts-morph';
import { collectVariableDeclarationBindings } from '../dead-code-eliminator/variable-declaration-bindings.ts';

export type DeadCodeEliminationExportCheckMode = 'declaration' | 'runtime';

type DeadCodeEliminationExportTarget = {
    readonly targetPath: string;
    readonly sourceFile: SourceFile | undefined;
    readonly targetOnly: boolean;
};

type DeadCodeEliminationExportResolver = {
    readonly resolve: (
        importerTargetPath: string,
        mode: DeadCodeEliminationExportCheckMode,
        specifier: string
    ) => DeadCodeEliminationExportTarget | undefined;
};

export type DeadCodeEliminationExportSearch = {
    readonly mode: DeadCodeEliminationExportCheckMode;
    readonly targetPath: string;
    readonly exportName: string;
    readonly sourceFile: SourceFile;
    readonly resolver: DeadCodeEliminationExportResolver;
};

type ExportableDeclaration = {
    readonly getName: () => string | undefined;
    readonly isExported: () => boolean;
};

type ExportedNameSearch = {
    readonly input: DeadCodeEliminationExportSearch;
    readonly visited: ReadonlySet<string>;
};

type ReExportSearch = ExportedNameSearch & {
    readonly declaration: ExportDeclaration;
    readonly target: DeadCodeEliminationExportTarget;
    readonly hasExportedName: (search: ExportedNameSearch) => boolean;
};

function exportedName(namedExport: ReturnType<ExportDeclaration['getNamedExports']>[number]): string {
    return namedExport.getAliasNode()?.getText() ?? namedExport.getName();
}

function exportAssignmentNames(statement: Statement): readonly string[] {
    return TsMorphNode.isExportAssignment(statement) && !statement.isExportEquals() ? [ 'default' ] : [];
}

function exportedDeclarationName(declaration: ExportableDeclaration): readonly string[] {
    const name = declaration.getName();
    return name !== undefined && declaration.isExported() ? [ name ] : [];
}

function functionExportNames(statement: Statement): readonly string[] {
    if (!TsMorphNode.isFunctionDeclaration(statement)) {
        return [];
    }
    return statement.isDefaultExport() ? [ 'default' ] : exportedDeclarationName(statement);
}

function classExportNames(statement: Statement): readonly string[] {
    if (!TsMorphNode.isClassDeclaration(statement)) {
        return [];
    }
    return statement.isDefaultExport() ? [ 'default' ] : exportedDeclarationName(statement);
}

function interfaceExportNames(statement: Statement): readonly string[] {
    return TsMorphNode.isInterfaceDeclaration(statement) ? exportedDeclarationName(statement) : [];
}

function typeAliasExportNames(statement: Statement): readonly string[] {
    return TsMorphNode.isTypeAliasDeclaration(statement) ? exportedDeclarationName(statement) : [];
}

function enumExportNames(statement: Statement): readonly string[] {
    return TsMorphNode.isEnumDeclaration(statement) ? exportedDeclarationName(statement) : [];
}

function moduleExportNames(statement: Statement): readonly string[] {
    return TsMorphNode.isModuleDeclaration(statement) ? exportedDeclarationName(statement) : [];
}

function variableExportNames(statement: Statement): readonly string[] {
    if (!TsMorphNode.isVariableStatement(statement) || !statement.isExported()) {
        return [];
    }
    return statement.getDeclarations().flatMap(function (declaration) {
        return collectVariableDeclarationBindings(declaration).map(function (binding) {
            return binding.name;
        });
    });
}

function statementExportNames(statement: Statement): readonly string[] {
    return [
        ...exportAssignmentNames(statement),
        ...functionExportNames(statement),
        ...classExportNames(statement),
        ...interfaceExportNames(statement),
        ...typeAliasExportNames(statement),
        ...enumExportNames(statement),
        ...moduleExportNames(statement),
        ...variableExportNames(statement)
    ];
}

function localExportNames(sourceFile: SourceFile): readonly string[] {
    return sourceFile
        .getExportDeclarations()
        .filter(function (declaration) {
            return declaration.getModuleSpecifierValue() === undefined;
        })
        .flatMap(function (declaration) {
            return declaration.getNamedExports().map(exportedName);
        });
}

function directExportNames(sourceFile: SourceFile): ReadonlySet<string> {
    return new Set([
        ...sourceFile.getStatements().flatMap(statementExportNames),
        ...localExportNames(sourceFile)
    ]);
}

function searchKey(input: DeadCodeEliminationExportSearch): string {
    return `${input.mode}\0${input.targetPath}\0${input.exportName}`;
}

function isNamedExportActive(
    mode: DeadCodeEliminationExportCheckMode,
    exportDeclaration: ExportDeclaration
): boolean {
    return mode === 'declaration' || !exportDeclaration.isTypeOnly();
}

function targetFromExportDeclaration(
    input: DeadCodeEliminationExportSearch,
    declaration: ExportDeclaration
): DeadCodeEliminationExportTarget | undefined {
    const moduleSpecifier = declaration.getModuleSpecifierValue();
    return moduleSpecifier === undefined
        ? undefined
        : input.resolver.resolve(input.targetPath, input.mode, moduleSpecifier);
}

function namespaceReExportMatches(search: ReExportSearch): boolean {
    const namespaceExport = search.declaration.getNamespaceExport();
    return namespaceExport?.getName() === search.input.exportName && !search.target.targetOnly;
}

function namedReExportMatches(search: ReExportSearch): boolean {
    const { sourceFile } = search.target;
    if (sourceFile === undefined) {
        return false;
    }
    return search.declaration.getNamedExports().some(function (namedExport) {
        return exportedName(namedExport) === search.input.exportName &&
            search.hasExportedName({
                input: {
                    ...search.input,
                    targetPath: search.target.targetPath,
                    exportName: namedExport.getName(),
                    sourceFile
                },
                visited: search.visited
            });
    });
}

function starReExportMatches(search: ReExportSearch): boolean {
    const { sourceFile } = search.target;
    if (sourceFile === undefined) {
        return false;
    }
    return search.declaration.getNamespaceExport() === undefined &&
        search.declaration.getNamedExports().length === 0 &&
        search.input.exportName !== 'default' &&
        search.hasExportedName({
            input: { ...search.input, targetPath: search.target.targetPath, sourceFile },
            visited: search.visited
        });
}

function reExportSearch(
    search: ExportedNameSearch,
    declaration: ExportDeclaration,
    target: DeadCodeEliminationExportTarget,
    findExportedName: ReExportSearch['hasExportedName']
): ReExportSearch {
    return { ...search, declaration, target, hasExportedName: findExportedName };
}

function reExportDeclarationMatches(
    search: ExportedNameSearch,
    declaration: ExportDeclaration,
    findExportedName: ReExportSearch['hasExportedName']
): boolean {
    const target = targetFromExportDeclaration(search.input, declaration);
    return isNamedExportActive(search.input.mode, declaration) &&
        target !== undefined &&
        !target.targetOnly &&
        (
            namespaceReExportMatches(reExportSearch(search, declaration, target, findExportedName)) ||
            namedReExportMatches(reExportSearch(search, declaration, target, findExportedName)) ||
            starReExportMatches(reExportSearch(search, declaration, target, findExportedName))
        );
}

function reExportDeclarationsMatch(
    search: ExportedNameSearch,
    findExportedName: ReExportSearch['hasExportedName']
): boolean {
    return search.input.sourceFile.getExportDeclarations().some(function (declaration) {
        return reExportDeclarationMatches(search, declaration, findExportedName);
    });
}

function hasExportedName(search: ExportedNameSearch): boolean {
    const key = searchKey(search.input);
    if (search.visited.has(key)) {
        return false;
    }
    const nextSearch = { ...search, visited: new Set([ ...search.visited, key ]) };
    return directExportNames(search.input.sourceFile).has(search.input.exportName) ||
        reExportDeclarationsMatch(nextSearch, hasExportedName);
}

export function hasDeadCodeEliminationExportedName(input: DeadCodeEliminationExportSearch): boolean {
    return hasExportedName({ input, visited: new Set() });
}
