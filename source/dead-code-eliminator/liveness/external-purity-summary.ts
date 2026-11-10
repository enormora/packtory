import {
    Node as TypeScriptMorphNode,
    type ExportDeclaration,
    type ExportSpecifier,
    type Expression,
    type MethodDeclaration,
    type ObjectLiteralExpression,
    type Project,
    type PropertyAssignment,
    type SourceFile,
    type Statement,
    type VariableDeclaration
} from 'ts-morph';
import { resolveRuntimeModule, type RuntimeModuleResolver } from '../runtime-module-resolution.ts';
import { bindingShapeIsStable, bindingValueIsStable } from '../binding-stability.ts';
import { callResultPath, type ImportedExpressionOrigin } from '../imported-expression-origin.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import {
    builderCallIsPure,
    builderIsSynchronous,
    builderReturnExpression,
    objectDataShapeIsKnown,
    objectMemberName,
    type BuilderFunction
} from './builder-return.ts';

export type ExportPurity = 'pure-callable' | 'pure-object' | 'unknown';

type ExportPath = ImportedExpressionOrigin['path'];
type ExportEntry = { readonly path: ExportPath; readonly purity: ExportPurity; };
type ExternalPuritySummary = { readonly exports: ReadonlyMap<string, ExportEntry>; };

type ExportPurityEntry = readonly [ExportPath, ExportPurity];

type ExportPurityRecorder = {
    readonly set: (key: ExportPath, value: ExportPurity) => unknown;
};

type SummaryCache = {
    readonly get: (filePath: string) => ExternalPuritySummary | undefined;
    readonly set: (filePath: string, summary: ExternalPuritySummary) => unknown;
};

type ExternalPuritySummaryBuilder = (sourceFile: SourceFile) => ExternalPuritySummary;
type ObjectEntriesCollector = (
    exportName: ExportPath,
    initializer: ObjectLiteralExpression
) => Iterable<ExportPurityEntry>;

type SummaryContext = {
    readonly sourceFile: SourceFile;
    readonly namespaces: ReadonlyMap<string, string>;
    readonly exportPurities: ExportPurityRecorder;
    readonly buildSummary: ExternalPuritySummaryBuilder;
};

type SupportedObjectProperty = MethodDeclaration | PropertyAssignment;

function isProjectSummaryStore(value: unknown): value is Map<string, ExternalPuritySummary> {
    return value instanceof Map;
}

function projectSummaryCache(project: Project): Map<string, ExternalPuritySummary> {
    const stored: unknown = Reflect.get(project, projectSummaryCache.name);
    const cache = isProjectSummaryStore(stored) ? stored : new Map<string, ExternalPuritySummary>();
    Reflect.set(project, projectSummaryCache.name, cache);
    return cache;
}

function callablePurity(builder: BuilderFunction): ExportPurity {
    return builderCallIsPure(builder) ? 'pure-callable' : 'unknown';
}

function propertyInitializerPurity(initializer: Expression): ExportPurity {
    if (TypeScriptMorphNode.isFunctionExpression(initializer) || TypeScriptMorphNode.isArrowFunction(initializer)) {
        return callablePurity(initializer);
    }
    return TypeScriptMorphNode.isObjectLiteralExpression(initializer) && objectDataShapeIsKnown(initializer)
        ? 'pure-object'
        : 'unknown';
}

function supportedObjectProperty(property: TypeScriptMorphNode): SupportedObjectProperty | undefined {
    if (TypeScriptMorphNode.isMethodDeclaration(property) || TypeScriptMorphNode.isPropertyAssignment(property)) {
        return property;
    }
    return undefined;
}

function propertyPurity(property: SupportedObjectProperty): ExportPurity {
    if (TypeScriptMorphNode.isMethodDeclaration(property)) {
        return callablePurity(property);
    }
    return propertyInitializerPurity(property.getInitializerOrThrow());
}

function* builderReturnObjectEntries(
    exportName: ExportPath,
    builder: BuilderFunction,
    collectObjectEntries: ObjectEntriesCollector
): Iterable<ExportPurityEntry> {
    if (!builderIsSynchronous(builder)) {
        return;
    }
    const unwrapped = unwrapExpression(builderReturnExpression(builder));
    if (TypeScriptMorphNode.isObjectLiteralExpression(unwrapped) && objectDataShapeIsKnown(unwrapped)) {
        yield* collectObjectEntries(callResultPath(exportName), unwrapped);
    }
}

function* methodReturnObjectEntries(
    propertyPath: ExportPath,
    property: TypeScriptMorphNode,
    collectObjectEntries: ObjectEntriesCollector
): Iterable<ExportPurityEntry> {
    if (TypeScriptMorphNode.isMethodDeclaration(property)) {
        yield* builderReturnObjectEntries(propertyPath, property, collectObjectEntries);
    }
}

function* propertyAssignmentReturnObjectEntries(
    propertyPath: ExportPath,
    property: TypeScriptMorphNode,
    collectObjectEntries: ObjectEntriesCollector
): Iterable<ExportPurityEntry> {
    if (!TypeScriptMorphNode.isPropertyAssignment(property)) {
        return;
    }
    const initializer = property.getInitializerOrThrow();
    if (TypeScriptMorphNode.isFunctionExpression(initializer) || TypeScriptMorphNode.isArrowFunction(initializer)) {
        yield* builderReturnObjectEntries(propertyPath, initializer, collectObjectEntries);
    }
}

function* objectPropertyExportEntries(
    exportName: ExportPath,
    property: TypeScriptMorphNode,
    collectObjectEntries: ObjectEntriesCollector
): Iterable<ExportPurityEntry> {
    const supportedProperty = supportedObjectProperty(property);
    if (supportedProperty === undefined) {
        return;
    }
    const name = objectMemberName(supportedProperty);
    const propertyPath: ExportPath = [ ...exportName, name ];
    yield [ propertyPath, propertyPurity(supportedProperty) ];
    yield* methodReturnObjectEntries(propertyPath, supportedProperty, collectObjectEntries);
    yield* propertyAssignmentReturnObjectEntries(propertyPath, supportedProperty, collectObjectEntries);
}

function* objectLiteralExportEntries(
    exportName: ExportPath,
    initializer: ObjectLiteralExpression
): Iterable<ExportPurityEntry> {
    if (!objectDataShapeIsKnown(initializer)) {
        return;
    }
    for (const property of initializer.getProperties()) {
        yield* objectPropertyExportEntries(exportName, property, objectLiteralExportEntries);
    }
    yield [ exportName, 'pure-object' ];
}

function variableExportIsStable(declaration: VariableDeclaration): boolean {
    const identifier = declaration.getNameNode();
    if (!TypeScriptMorphNode.isIdentifier(identifier) || !bindingValueIsStable(identifier)) {
        return false;
    }
    return !TypeScriptMorphNode.isObjectLiteralExpression(declaration.getInitializer()) ||
        bindingShapeIsStable(identifier, function () {
            return false;
        });
}

function* variableExportEntries(declaration: VariableDeclaration): Iterable<ExportPurityEntry> {
    if (!variableExportIsStable(declaration)) {
        return;
    }
    const initializer = declaration.getInitializer();
    const name = declaration.getName();
    if (TypeScriptMorphNode.isObjectLiteralExpression(initializer)) {
        yield* objectLiteralExportEntries([ name ], initializer);
    }
    if (TypeScriptMorphNode.isFunctionExpression(initializer) || TypeScriptMorphNode.isArrowFunction(initializer)) {
        yield [ [ name ], callablePurity(initializer) ];
        yield* builderReturnObjectEntries([ name ], initializer, objectLiteralExportEntries);
    }
}

function addVariableExport(declaration: VariableDeclaration, context: SummaryContext): void {
    for (const [ name, purity ] of variableExportEntries(declaration)) {
        context.exportPurities.set(name, purity);
    }
}

function mergeExports(context: SummaryContext, prefix: string, source: ReadonlyMap<string, ExportEntry>): void {
    for (const entry of source.values()) {
        context.exportPurities.set(prefix === '' ? entry.path : [ prefix, ...entry.path ], entry.purity);
    }
    if (prefix !== '') {
        context.exportPurities.set([ prefix ], 'pure-object');
    }
}

function resolvedModuleSummary(context: SummaryContext, moduleSpecifier: string): ExternalPuritySummary | undefined {
    const target = resolveRuntimeModule(moduleSpecifier, context.sourceFile);
    return target === undefined ? undefined : context.buildSummary(target);
}

function importedNamespaceSources(sourceFile: SourceFile): ReadonlyMap<string, string> {
    const namespaces = new Map<string, string>();
    for (const declaration of sourceFile.getImportDeclarations()) {
        const namespace = declaration.getNamespaceImport();
        if (namespace !== undefined) {
            namespaces.set(namespace.getText(), declaration.getModuleSpecifierValue());
        }
    }
    return namespaces;
}

function mergeNestedNamedExport(
    context: SummaryContext,
    sourceName: string,
    exportedName: string,
    summary: ExternalPuritySummary
): void {
    for (const entry of summary.exports.values()) {
        if (entry.path[0] === sourceName) {
            context.exportPurities.set([ exportedName, ...entry.path.slice(1) ], entry.purity);
        }
    }
}

function mergeNamedExport(
    context: SummaryContext,
    namedExport: ExportSpecifier,
    summary: ExternalPuritySummary
): void {
    const sourceName = namedExport.getName();
    const exportedName = namedExport.getAliasNode()?.getText() ?? sourceName;
    context.exportPurities.set(
        [ exportedName ],
        summary.exports.get(JSON.stringify([ sourceName ]))?.purity ?? 'unknown'
    );
    mergeNestedNamedExport(context, sourceName, exportedName, summary);
}

function mergeNamedExports(
    context: SummaryContext,
    declaration: ExportDeclaration,
    summary: ExternalPuritySummary
): void {
    for (const namedExport of declaration.getNamedExports()) {
        mergeNamedExport(context, namedExport, summary);
    }
}

function mergeModuleExportsByKind(
    context: SummaryContext,
    declaration: ExportDeclaration,
    summary: ExternalPuritySummary
): void {
    if (declaration.getNamedExports().length === 0) {
        mergeExports(context, '', summary.exports);
        return;
    }
    mergeNamedExports(context, declaration, summary);
}

function mergeModuleExportDeclaration(
    context: SummaryContext,
    declaration: ExportDeclaration,
    moduleSpecifier: string
): void {
    const summary = resolvedModuleSummary(context, moduleSpecifier);
    if (summary === undefined) {
        return;
    }
    const namespaceExport = declaration.getNamespaceExport();
    if (namespaceExport !== undefined) {
        mergeExports(context, namespaceExport.getName(), summary.exports);
        return;
    }
    mergeModuleExportsByKind(context, declaration, summary);
}

function mergeNamespaceReexport(
    context: SummaryContext,
    namedExport: ExportSpecifier,
    namespaceSource: string
): void {
    const summary = resolvedModuleSummary(context, namespaceSource);
    if (summary === undefined) {
        return;
    }
    const sourceName = namedExport.getName();
    const exportedName = namedExport.getAliasNode()?.getText() ?? sourceName;
    mergeExports(context, exportedName, summary.exports);
}

function mergeLocalExportDeclaration(context: SummaryContext, declaration: ExportDeclaration): void {
    for (const namedExport of declaration.getNamedExports()) {
        const namespaceSource = context.namespaces.get(namedExport.getName());
        if (namespaceSource !== undefined) {
            mergeNamespaceReexport(context, namedExport, namespaceSource);
        }
    }
}

function mergeExportDeclaration(context: SummaryContext, declaration: ExportDeclaration): void {
    const moduleSpecifier = declaration.getModuleSpecifierValue();
    if (moduleSpecifier !== undefined) {
        mergeModuleExportDeclaration(context, declaration, moduleSpecifier);
        return;
    }
    mergeLocalExportDeclaration(context, declaration);
}

function addFunctionExport(statement: Statement, context: SummaryContext): void {
    if (!TypeScriptMorphNode.isFunctionDeclaration(statement) || !statement.isExported()) {
        return;
    }
    const name = statement.getNameNode();
    if (name !== undefined && bindingValueIsStable(name)) {
        context.exportPurities.set([ name.getText() ], callablePurity(statement));
        for (
            const [ path, purity ] of builderReturnObjectEntries(
                [ name.getText() ],
                statement,
                objectLiteralExportEntries
            )
        ) {
            context.exportPurities.set(path, purity);
        }
    }
}

function addVariableStatementExports(statement: Statement, context: SummaryContext): void {
    if (!TypeScriptMorphNode.isVariableStatement(statement) || !statement.isExported()) {
        return;
    }
    for (const declaration of statement.getDeclarations()) {
        addVariableExport(declaration, context);
    }
}

function mergeStatementExports(context: SummaryContext, statement: Statement): void {
    addFunctionExport(statement, context);
    addVariableStatementExports(statement, context);
    if (TypeScriptMorphNode.isExportDeclaration(statement)) {
        mergeExportDeclaration(context, statement);
    }
}

function summaryContext(
    sourceFile: SourceFile,
    exportPurities: ExportPurityRecorder,
    buildSummary: ExternalPuritySummaryBuilder
): SummaryContext {
    return {
        sourceFile,
        namespaces: importedNamespaceSources(sourceFile),
        exportPurities,
        buildSummary
    };
}

function createExternalPuritySummary(
    sourceFile: SourceFile,
    cache: SummaryCache,
    buildSummary: ExternalPuritySummaryBuilder
): ExternalPuritySummary {
    const exportPurities = new Map<string, ExportEntry>();
    const summary: ExternalPuritySummary = { exports: exportPurities };
    cache.set(sourceFile.getFilePath(), summary);
    const context = summaryContext(sourceFile, {
        set(path, purity) {
            exportPurities.set(JSON.stringify(path), { path, purity });
        }
    }, buildSummary);
    for (const statement of sourceFile.getStatements()) {
        mergeStatementExports(context, statement);
    }
    return summary;
}

function buildExternalPuritySummary(sourceFile: SourceFile): ExternalPuritySummary {
    const cache = projectSummaryCache(sourceFile.getProject());
    const cached = cache.get(sourceFile.getFilePath());
    return cached ?? createExternalPuritySummary(sourceFile, cache, buildExternalPuritySummary);
}

function exportKey(origin: ImportedExpressionOrigin): string {
    return JSON.stringify(origin.path);
}

export function exportPurityForOrigin(
    origin: ImportedExpressionOrigin,
    containingSourceFile: SourceFile,
    resolveModule: RuntimeModuleResolver
): ExportPurity {
    const sourceFile = resolveModule(origin.from, containingSourceFile);
    if (sourceFile === undefined) {
        return 'unknown';
    }
    return buildExternalPuritySummary(sourceFile).exports.get(exportKey(origin))?.purity ?? 'unknown';
}

export function exportHasPureObjectReturnForOrigin(
    origin: ImportedExpressionOrigin,
    containingSourceFile: SourceFile,
    resolveModule: RuntimeModuleResolver
): boolean {
    const sourceFile = resolveModule(origin.from, containingSourceFile);
    if (sourceFile === undefined) {
        return false;
    }
    return buildExternalPuritySummary(sourceFile).exports.get(JSON.stringify(callResultPath(origin.path)))?.purity ===
        'pure-object';
}
