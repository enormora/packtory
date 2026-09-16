import path from 'node:path';
import {
    ModuleKind,
    ModuleResolutionKind,
    Node as TsMorphNode,
    Project,
    ScriptTarget,
    type ExportDeclaration,
    type ImportDeclaration,
    type SourceFile,
    type StringLiteral
} from 'ts-morph';
import { getModuleReferenceLiterals } from '../../dependency-scanner/source-file-references.ts';
import type { AnalyzedBundle, AnalyzedBundleResource } from '../analyzed-bundle.ts';
import {
    isCodeTargetPath,
    isDeclarationCodeTargetPath
} from '../liveness/runtime-code.ts';
import {
    hasDeadCodeEliminationExportedName,
    type DeadCodeEliminationExportCheckMode
} from './export-resolution.ts';
import { candidatesFor, declarationCandidates } from './target-candidates.ts';

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

type ResolvedExportTarget = {
    readonly specifier: string;
    readonly target: ResolvedTarget;
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

const localDeclarationMethods = [
    'getClass',
    'getEnum',
    'getFunction',
    'getInterface',
    'getModule',
    'getTypeAlias',
    'getVariableDeclaration'
] as const;

function createInvariantProject(): Project {
    return new Project({
        compilerOptions: {
            allowJs: true,
            module: ModuleKind.Node16,
            target: ScriptTarget.ES2022,
            moduleResolution: ModuleResolutionKind.Node16
        }
    });
}

function normalizeTargetPath(targetFilePath: string): string {
    return path.posix.normalize(targetFilePath);
}

function isRelativeOrAbsoluteSpecifier(specifier: string): boolean {
    return specifier.startsWith('.') || path.posix.isAbsolute(specifier);
}

function isPackageLikeSpecifier(specifier: string): boolean {
    return !isRelativeOrAbsoluteSpecifier(specifier);
}

function resolveTargetPath(importerTargetPath: string, specifier: string): string {
    if (path.posix.isAbsolute(specifier)) {
        return normalizeTargetPath(specifier.slice(1));
    }
    return normalizeTargetPath(path.posix.join(path.posix.dirname(importerTargetPath), specifier));
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

function isNamedExportActive(mode: CheckMode, exportDeclaration: ExportDeclaration): boolean {
    return mode === 'declaration' || !exportDeclaration.isTypeOnly();
}

function genericMissingTargetIssue(context: ModuleCheck, specifier: string): string {
    return [
        `${context.index.bundle.name}: ${context.importerTargetPath} imports ${specifier} in ${context.mode} mode,`,
        'but no emitted target remains'
    ]
        .join(' ');
}

function runtimeMissingTargetIssue(context: ModuleCheck, specifier: string): string {
    const declarationOnly = runtimeDeclarationOnlyCandidates(context, specifier);
    return declarationOnly.length === 0
        ? genericMissingTargetIssue(context, specifier)
        : [
            `${context.index.bundle.name}: ${context.importerTargetPath} imports ${specifier} in runtime mode,`,
            `but only declaration targets remain: ${declarationOnly.join(', ')}`
        ]
            .join(' ');
}

const missingTargetIssueByMode: Readonly<Record<CheckMode, (context: ModuleCheck, specifier: string) => string>> = {
    declaration: genericMissingTargetIssue,
    runtime: runtimeMissingTargetIssue
};

function missingTargetIssue(context: ModuleCheck, specifier: string): string {
    return missingTargetIssueByMode[context.mode](context, specifier);
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
    if (sourceFile === undefined) {
        return;
    }
    if (
        !hasDeadCodeEliminationExportedName({
            maximumDepth: 2,
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
                            targetOnly: !isCodeTargetPath(resolvedTarget.targetPath)
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

function exportTarget(context: ModuleCheck, declaration: ExportDeclaration): ResolvedExportTarget | undefined {
    const specifier = declaration.getModuleSpecifierValue();
    if (
        specifier === undefined ||
        !isNamedExportActive(context.mode, declaration) ||
        isPackageLikeSpecifier(specifier)
    ) {
        return undefined;
    }
    const target = checkTargetExists(context, specifier);
    return target === undefined ? undefined : { specifier, target };
}

function checkReExportNames(
    context: ModuleCheck,
    declaration: ExportDeclaration,
    specifier: string,
    target: ResolvedTarget
): void {
    for (const namedExport of declaration.getNamedExports()) {
        checkImportedExport(context, specifier, namedExport.getName(), target);
    }
}

function hasLocalImportBinding(sourceFile: SourceFile, name: string): boolean {
    const names = sourceFile.getImportDeclarations().flatMap(function (declaration) {
        return [
            declaration.getDefaultImport()?.getText(),
            declaration.getNamespaceImport()?.getText(),
            ...declaration.getNamedImports().map(function (namedImport) {
                return namedImport.getAliasNode()?.getText() ?? namedImport.getName();
            })
        ];
    });
    return names.includes(name);
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
    const resolved = exportTarget(context, declaration);
    if (resolved !== undefined) {
        checkReExportNames(context, declaration, resolved.specifier, resolved.target);
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
        project: createInvariantProject(),
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

function checkBundle(issues: IssueRecorder, bundle: AnalyzedBundle): void {
    const index = createBundleIndex(issues, bundle);
    for (const [ targetPath, resource ] of index.resourcesByTargetPath) {
        const { sourceFile } = resource;
        if (sourceFile !== undefined) {
            checkStaticModuleGraph(issues, index, targetPath, sourceFile);
        }
    }
    checkMetadata(issues, index);
}

export function collectDeadCodeEliminationOutputIssues(bundles: readonly AnalyzedBundle[]): readonly string[] {
    const issues: string[] = [];
    const recorder: IssueRecorder = {
        add(issue) {
            issues.push(issue);
        }
    };
    for (const bundle of bundles) {
        checkBundle(recorder, bundle);
    }
    return issues;
}
