import assert from 'node:assert';
import { isBuiltin } from 'node:module';
import path from 'node:path';
import {
    Node as TsMorphNode,
    type ExportDeclaration,
    type ImportDeclaration,
    type Project,
    type SourceFile,
    type StringLiteral
} from 'ts-morph';
import { declarationCompanionCandidates } from '../common/declaration-companion-paths.ts';
import { getModuleReferenceLiterals } from '../dependency-scanner/source-file-references.ts';
import type { AnalyzedBundle, AnalyzedBundleResource } from '../dead-code-eliminator/analyzed-bundle.ts';
import {
    isCodeTargetPath,
    isDeclarationCodeTargetPath,
    isRuntimeCodeTargetPath
} from '../dead-code-eliminator/liveness/runtime-code.ts';
import {
    hasDeadCodeEliminationExportedName,
    type DeadCodeEliminationExportCheckMode
} from './dead-code-elimination-export-resolution.ts';
import { createProject } from './typescript-project.ts';

type CheckMode = DeadCodeEliminationExportCheckMode;

type IssueRecorder = {
    readonly add: (issue: string) => void;
};

type IndexedResource = {
    readonly resource: AnalyzedBundleResource;
    readonly sourceFile: SourceFile | undefined;
};

type ResolvedTarget = {
    readonly targetPath: string;
    readonly resource: IndexedResource;
};

type BundleIndex = {
    readonly bundle: AnalyzedBundle;
    readonly resourcesByTargetPath: ReadonlyMap<string, IndexedResource>;
    readonly targetPaths: ReadonlySet<string>;
};

type ModuleCheck = {
    readonly issues: IssueRecorder;
    readonly index: BundleIndex;
    readonly mode: CheckMode;
    readonly importerTargetPath: string;
};

type IndexBuild = {
    readonly issues: IssueRecorder;
    readonly bundle: AnalyzedBundle;
    readonly project: Project;
    readonly addTargetPath: (targetFilePath: string) => void;
    readonly hasTargetPath: (targetPath: string) => boolean;
    readonly setResource: (targetPath: string, resource: IndexedResource) => void;
};

type MissingTargetPathCheck = {
    readonly issues: IssueRecorder;
    readonly index: BundleIndex;
    readonly label: string;
    readonly dependencyName: string;
    readonly targetFilePath: string;
};

const runtimeTargetExtensions = [
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.json',
    '.wasm'
];
const declarationTargetExtensions = [ '.d.ts', '.d.mts', '.d.cts' ];
const localDeclarationMethods = [
    'getClass',
    'getEnum',
    'getFunction',
    'getInterface',
    'getModule',
    'getTypeAlias',
    'getVariableDeclaration'
] as const;

function normalizeTargetPath(targetFilePath: string): string {
    return path.posix.normalize(targetFilePath);
}

function isRelativeOrAbsoluteSpecifier(specifier: string): boolean {
    return specifier.startsWith('.') || path.posix.isAbsolute(specifier);
}

function isPackageLikeSpecifier(specifier: string): boolean {
    return !isRelativeOrAbsoluteSpecifier(specifier) || specifier.startsWith('#') || isBuiltin(specifier);
}

function resolveTargetPath(importerTargetPath: string, specifier: string): string {
    if (path.posix.isAbsolute(specifier)) {
        return normalizeTargetPath(specifier.slice(1));
    }
    return normalizeTargetPath(path.posix.join(path.posix.dirname(importerTargetPath), specifier));
}

function appendedCandidates(targetPath: string, extensions: readonly string[]): readonly string[] {
    return extensions.map(function (extension) {
        return `${targetPath}${extension}`;
    });
}

function runtimeCandidates(targetPath: string): readonly string[] {
    return [ targetPath, ...appendedCandidates(targetPath, runtimeTargetExtensions) ];
}

function declarationCandidates(targetPath: string): readonly string[] {
    return [
        targetPath,
        ...declarationCompanionCandidates(targetPath),
        ...appendedCandidates(targetPath, declarationTargetExtensions)
    ];
}

function candidatesFor(mode: CheckMode, targetPath: string): readonly string[] {
    return mode === 'runtime' ? runtimeCandidates(targetPath) : declarationCandidates(targetPath);
}

function isTargetAllowedInMode(mode: CheckMode, targetPath: string): boolean {
    return mode === 'declaration' ? isDeclarationCodeTargetPath(targetPath) : !isDeclarationCodeTargetPath(targetPath);
}

function resolveLocalTarget(context: ModuleCheck, specifier: string): ResolvedTarget | undefined {
    const targetPath = resolveTargetPath(context.importerTargetPath, specifier);
    return candidatesFor(context.mode, targetPath)
        .flatMap(function (candidate): readonly ResolvedTarget[] {
            const resource = context.index.resourcesByTargetPath.get(candidate);
            return resource !== undefined && isTargetAllowedInMode(context.mode, candidate)
                ? [ { targetPath: candidate, resource } ]
                : [];
        })[0];
}

function runtimeDeclarationOnlyCandidates(context: ModuleCheck, specifier: string): readonly string[] {
    const targetPath = resolveTargetPath(context.importerTargetPath, specifier);
    return declarationCandidates(targetPath).filter(function (candidate) {
        return context.index.resourcesByTargetPath.has(candidate) && isDeclarationCodeTargetPath(candidate);
    });
}

function isTargetOnlyResource(targetPath: string): boolean {
    return !isCodeTargetPath(targetPath);
}

function isNamedExportActive(mode: CheckMode, exportDeclaration: ExportDeclaration): boolean {
    return mode === 'declaration' || !exportDeclaration.isTypeOnly();
}

function missingTargetIssue(context: ModuleCheck, specifier: string): string {
    const declarationOnly = context.mode === 'runtime' ? runtimeDeclarationOnlyCandidates(context, specifier) : [];
    if (declarationOnly.length > 0) {
        const targets = declarationOnly.join(', ');
        return [
            `${context.index.bundle.name}: ${context.importerTargetPath} imports ${specifier} in runtime mode,`,
            `but only declaration targets remain: ${targets}`
        ]
            .join(' ');
    }
    return [
        `${context.index.bundle.name}: ${context.importerTargetPath} imports ${specifier} in ${context.mode} mode,`,
        'but no emitted target remains'
    ]
        .join(' ');
}

function checkTargetExists(context: ModuleCheck, specifier: string): ResolvedTarget | undefined {
    const target = resolveLocalTarget(context, specifier);
    if (target === undefined) {
        context.issues.add(missingTargetIssue(context, specifier));
    }
    return target;
}

function checkImportedExport(
    context: ModuleCheck,
    specifier: string,
    exportName: string,
    target: ResolvedTarget
): void {
    const { sourceFile } = target.resource;
    const targetOnly = isTargetOnlyResource(target.targetPath);
    if (
        !targetOnly &&
        sourceFile !== undefined &&
        !hasDeadCodeEliminationExportedName({
            mode: context.mode,
            targetPath: target.targetPath,
            exportName,
            sourceFile,
            resolver: {
                resolve(importerTargetPath, mode, targetSpecifier) {
                    const moduleContext = { ...context, mode, importerTargetPath };
                    const resolvedTarget = resolveLocalTarget(moduleContext, targetSpecifier);
                    return resolvedTarget === undefined
                        ? undefined
                        : {
                            targetPath: resolvedTarget.targetPath,
                            sourceFile: resolvedTarget.resource.sourceFile,
                            targetOnly: isTargetOnlyResource(resolvedTarget.targetPath)
                        };
                }
            }
        })
    ) {
        const location = `${context.index.bundle.name}: ${context.importerTargetPath}`;
        const source = `imports ${exportName} from ${specifier}`;
        const problem = `but ${target.targetPath} does not export it in ${context.mode} mode`;
        context.issues.add(`${location} ${source}, ${problem}`);
    }
}

function activeNamedImports(
    mode: CheckMode,
    declaration: ImportDeclaration
): ReturnType<ImportDeclaration['getNamedImports']> {
    return mode === 'declaration'
        ? declaration.getNamedImports()
        : declaration.getNamedImports().filter(function (namedImport) {
            return !namedImport.isTypeOnly();
        });
}

function skipsImportTarget(context: ModuleCheck, declaration: ImportDeclaration, specifier: string): boolean {
    return isPackageLikeSpecifier(specifier) || context.mode === 'runtime' && declaration.isTypeOnly();
}

function checkDefaultImport(
    context: ModuleCheck,
    specifier: string,
    target: ResolvedTarget,
    declaration: ImportDeclaration
): void {
    if (declaration.getDefaultImport() !== undefined) {
        checkImportedExport(context, specifier, 'default', target);
    }
}

function checkNamedImports(
    context: ModuleCheck,
    specifier: string,
    target: ResolvedTarget,
    declaration: ImportDeclaration
): void {
    for (const namedImport of activeNamedImports(context.mode, declaration)) {
        checkImportedExport(context, specifier, namedImport.getName(), target);
    }
}

function checkImportDeclaration(context: ModuleCheck, declaration: ImportDeclaration): void {
    const specifier = declaration.getModuleSpecifierValue();
    if (skipsImportTarget(context, declaration, specifier)) {
        return;
    }
    const target = checkTargetExists(context, specifier);
    if (target !== undefined && declaration.getNamespaceImport() === undefined) {
        checkDefaultImport(context, specifier, target, declaration);
        checkNamedImports(context, specifier, target, declaration);
    }
}

function exportTarget(context: ModuleCheck, declaration: ExportDeclaration): ResolvedTarget | undefined {
    const specifier = declaration.getModuleSpecifierValue();
    if (
        specifier === undefined ||
        !isNamedExportActive(context.mode, declaration) ||
        isPackageLikeSpecifier(specifier)
    ) {
        return undefined;
    }
    return checkTargetExists(context, specifier);
}

function checksReExportNames(declaration: ExportDeclaration, target: ResolvedTarget): boolean {
    return !isTargetOnlyResource(target.targetPath) &&
        declaration.getNamespaceExport() === undefined &&
        declaration.getNamedExports().length > 0;
}

function checkReExportNames(context: ModuleCheck, declaration: ExportDeclaration, target: ResolvedTarget): void {
    const specifier = declaration.getModuleSpecifierValue();
    if (specifier !== undefined && checksReExportNames(declaration, target)) {
        for (const namedExport of declaration.getNamedExports()) {
            checkImportedExport(context, specifier, namedExport.getName(), target);
        }
    }
}

function hasLocalImportBinding(sourceFile: SourceFile, name: string): boolean {
    return sourceFile.getImportDeclarations().some(function (declaration) {
        return declaration.getDefaultImport()?.getText() === name ||
            declaration.getNamespaceImport()?.getText() === name ||
            declaration.getNamedImports().some(function (namedImport) {
                return (namedImport.getAliasNode()?.getText() ?? namedImport.getName()) === name;
            });
    });
}

function hasLocalBinding(sourceFile: SourceFile, name: string): boolean {
    return localDeclarationMethods.some(function (method) {
        return sourceFile[method](name) !== undefined;
    }) || hasLocalImportBinding(sourceFile, name);
}

function checkLocalExportNames(context: ModuleCheck, declaration: ExportDeclaration): void {
    if (declaration.getModuleSpecifierValue() !== undefined || !isNamedExportActive(context.mode, declaration)) {
        return;
    }
    for (const namedExport of declaration.getNamedExports()) {
        const localName = namedExport.getName();
        if (!hasLocalBinding(declaration.getSourceFile(), localName)) {
            context.issues.add([
                `${context.index.bundle.name}: ${context.importerTargetPath}`,
                `exports local ${localName}, but no local binding remains`
            ]
                .join(' '));
        }
    }
}

function checkExportDeclaration(context: ModuleCheck, declaration: ExportDeclaration): void {
    checkLocalExportNames(context, declaration);
    const target = exportTarget(context, declaration);
    if (target !== undefined) {
        checkReExportNames(context, declaration, target);
    }
}

function checkModuleReferenceLiteral(context: ModuleCheck, literal: StringLiteral): void {
    const specifier = literal.getLiteralValue();
    if (!isPackageLikeSpecifier(specifier)) {
        checkTargetExists(context, specifier);
    }
}

function isStaticModuleSpecifier(literal: StringLiteral): boolean {
    return literal.getFirstAncestor(function (node) {
        return TsMorphNode.isImportDeclaration(node) || TsMorphNode.isExportDeclaration(node);
    }) !== undefined;
}

function moduleCheck(issues: IssueRecorder, index: BundleIndex, targetPath: string): ModuleCheck {
    return {
        issues,
        index,
        mode: isDeclarationCodeTargetPath(targetPath) ? 'declaration' : 'runtime',
        importerTargetPath: targetPath
    };
}

function checkStaticModuleGraph(
    issues: IssueRecorder,
    index: BundleIndex,
    targetPath: string,
    sourceFile: SourceFile
): void {
    const context = moduleCheck(issues, index, targetPath);
    for (const declaration of sourceFile.getImportDeclarations()) {
        checkImportDeclaration(context, declaration);
    }
    for (const declaration of sourceFile.getExportDeclarations()) {
        checkExportDeclaration(context, declaration);
    }
    const dynamicLiterals = getModuleReferenceLiterals(sourceFile).filter(function (moduleLiteral) {
        return !isStaticModuleSpecifier(moduleLiteral);
    });
    for (const literal of dynamicLiterals) {
        checkModuleReferenceLiteral(context, literal);
    }
}

function addMissingTargetPathIssue(input: MissingTargetPathCheck): void {
    if (!input.index.targetPaths.has(input.targetFilePath)) {
        const source = `${input.index.bundle.name}: ${input.label} ${input.dependencyName}`;
        input.issues.add(`${source} references pruned target file ${input.targetFilePath}`);
    }
}

function checkDependencyMap(
    issues: IssueRecorder,
    index: BundleIndex,
    label: string,
    dependencies: AnalyzedBundle['externalDependencies']
): void {
    for (const dependency of dependencies.values()) {
        for (const targetFilePath of dependency.referencedFrom) {
            addMissingTargetPathIssue({ issues, index, label, dependencyName: dependency.name, targetFilePath });
        }
        const references = dependency.references ?? [];
        for (const reference of references) {
            addMissingTargetPathIssue({
                issues,
                index,
                label,
                dependencyName: dependency.name,
                targetFilePath: reference.targetFilePath
            });
        }
    }
}

function directDependencyIssue(index: BundleIndex, resource: AnalyzedBundleResource, targetFilePath: string): string {
    return [
        `${index.bundle.name}: ${resource.fileDescription.targetFilePath}`,
        `has direct dependency on pruned target file ${targetFilePath}`
    ]
        .join(' ');
}

function checkDirectDependencies(issues: IssueRecorder, index: BundleIndex, resource: AnalyzedBundleResource): void {
    if (isCodeTargetPath(resource.fileDescription.targetFilePath)) {
        for (const targetFilePath of resource.directDependencies) {
            if (!targetFilePath.endsWith('.map') && !index.targetPaths.has(targetFilePath)) {
                issues.add(directDependencyIssue(index, resource, targetFilePath));
            }
        }
    }
}

function checkSubstitutedSourcePathPackages(issues: IssueRecorder, index: BundleIndex): void {
    for (const packageName of index.bundle.substitutedInputFilePathsByPackageName.keys()) {
        if (!index.bundle.linkedBundleDependencies.has(packageName)) {
            issues.add([
                `${index.bundle.name}: substituted source paths keep package ${packageName}`,
                'without linked dependency metadata'
            ]
                .join(' '));
        }
    }
}

function checkMetadata(issues: IssueRecorder, index: BundleIndex): void {
    checkDependencyMap(issues, index, 'external dependency', index.bundle.externalDependencies);
    checkDependencyMap(issues, index, 'linked bundle dependency', index.bundle.linkedBundleDependencies);
    checkSubstitutedSourcePathPackages(issues, index);
    for (const resource of index.bundle.contents) {
        checkDirectDependencies(issues, index, resource);
    }
}

function sourceFileForResource(
    build: IndexBuild,
    resource: AnalyzedBundleResource,
    targetPath: string
): SourceFile | undefined {
    return isCodeTargetPath(targetPath)
        ? build.project.createSourceFile(
            `/${build.bundle.name}/${targetPath}`,
            resource.fileDescription.content,
            { overwrite: true }
        )
        : undefined;
}

function indexResource(build: IndexBuild, resource: AnalyzedBundleResource): void {
    const targetPath = normalizeTargetPath(resource.fileDescription.targetFilePath);
    if (build.hasTargetPath(targetPath)) {
        build.issues.add(`${build.bundle.name}: duplicate emitted target path ${targetPath}`);
    }
    build.addTargetPath(targetPath);
    build.setResource(targetPath, {
        resource,
        sourceFile: sourceFileForResource(build, resource, targetPath)
    });
}

function createBundleIndex(issues: IssueRecorder, bundle: AnalyzedBundle): BundleIndex {
    const resourcesByTargetPath = new Map<string, IndexedResource>();
    const targetPaths = new Set<string>();
    const build: IndexBuild = {
        issues,
        bundle,
        project: createProject(),
        addTargetPath(targetFilePath) {
            targetPaths.add(targetFilePath);
        },
        hasTargetPath(targetPath) {
            return resourcesByTargetPath.has(targetPath);
        },
        setResource(targetPath, resource) {
            resourcesByTargetPath.set(targetPath, resource);
        }
    };
    for (const resource of bundle.contents) {
        indexResource(build, resource);
    }
    return {
        bundle,
        resourcesByTargetPath,
        targetPaths
    };
}

function isCheckedCodeTarget(targetPath: string): boolean {
    return isRuntimeCodeTargetPath(targetPath) || isDeclarationCodeTargetPath(targetPath);
}

function checkBundle(issues: IssueRecorder, bundle: AnalyzedBundle): void {
    const index = createBundleIndex(issues, bundle);
    for (const [ targetPath, resource ] of index.resourcesByTargetPath) {
        const { sourceFile } = resource;
        if (sourceFile !== undefined && isCheckedCodeTarget(targetPath)) {
            checkStaticModuleGraph(issues, index, targetPath, sourceFile);
        }
    }
    checkMetadata(issues, index);
}

function formatIssues(caseName: string, issues: readonly string[]): string {
    return `${caseName}: dead code elimination output invariant failures:\n${
        issues
            .map(function (issue) {
                return `- ${issue}`;
            })
            .join('\n')
    }`;
}

export function assertValidDeadCodeEliminationOutput(caseName: string, bundles: readonly AnalyzedBundle[]): void {
    const issues: string[] = [];
    const recorder: IssueRecorder = {
        add(issue) {
            issues.push(issue);
        }
    };
    for (const bundle of bundles) {
        checkBundle(recorder, bundle);
    }
    if (issues.length > 0) {
        assert.fail(formatIssues(caseName, issues));
    }
}
