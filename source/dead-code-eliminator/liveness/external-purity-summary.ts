import {
    Node as TsMorphNode,
    SyntaxKind,
    type ArrowFunction,
    type Block,
    type ExportDeclaration,
    type ExportSpecifier,
    type Expression,
    type FunctionDeclaration,
    type FunctionExpression,
    type MethodDeclaration,
    type ObjectLiteralExpression,
    type Project,
    type PropertyAssignment,
    type SourceFile,
    type Statement,
    type VariableDeclaration
} from 'ts-morph';
import type { ImportedExpressionOrigin } from '../imported-expression-origin.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { resolveModuleSourceFile } from './external-module-resolution.ts';

export type ExportPurity = 'pure-callable' | 'pure-object' | 'unknown';

type ExternalPuritySummary = {
    readonly exports: ReadonlyMap<string, ExportPurity>;
};

type ExportPurityEntry = readonly [string, ExportPurity];

type ExportPurityRecorder = {
    readonly set: (key: string, value: ExportPurity) => unknown;
};

type SummaryCache = {
    readonly get: (filePath: string) => ExternalPuritySummary | undefined;
    readonly set: (filePath: string, summary: ExternalPuritySummary) => unknown;
};

type ExternalPuritySummaryBuilder = (sourceFile: SourceFile) => ExternalPuritySummary;
type ObjectEntriesCollector = (
    exportName: string,
    initializer: ObjectLiteralExpression,
    selfPurity: ExportPurity | undefined
) => readonly ExportPurityEntry[];

type SummaryContext = {
    readonly sourceFile: SourceFile;
    readonly namespaces: ReadonlyMap<string, string>;
    readonly exportPurities: ExportPurityRecorder;
    readonly buildSummary: ExternalPuritySummaryBuilder;
};

type FunctionLike = ArrowFunction | FunctionDeclaration | FunctionExpression | MethodDeclaration;
type SupportedObjectProperty = MethodDeclaration | PropertyAssignment;

const summariesByProject = new WeakMap<Project, Map<string, ExternalPuritySummary>>();
const pureReturnLeafKinds = new Set([
    SyntaxKind.StringLiteral,
    SyntaxKind.NumericLiteral,
    SyntaxKind.TrueKeyword,
    SyntaxKind.FalseKeyword,
    SyntaxKind.NullKeyword
]);
const noExportEntries: readonly ExportPurityEntry[] = [];

function projectSummaryCache(project: Project): Map<string, ExternalPuritySummary> {
    const existing = summariesByProject.get(project);
    if (existing !== undefined) {
        return existing;
    }
    const created = new Map<string, ExternalPuritySummary>();
    summariesByProject.set(project, created);
    return created;
}

function arrowReturnExpressionFrom(functionLike: ArrowFunction): Expression | undefined {
    const body = functionLike.getBody();
    return TsMorphNode.isExpression(body) ? body : undefined;
}

function blockFromFunctionLike(
    functionLike: FunctionDeclaration | FunctionExpression | MethodDeclaration
): Block | undefined {
    return functionLike.getBody()?.asKind(SyntaxKind.Block);
}

function blockReturnExpressionFrom(
    functionLike: FunctionDeclaration | FunctionExpression | MethodDeclaration
): Expression | undefined {
    const body = blockFromFunctionLike(functionLike);
    if (body === undefined) {
        return undefined;
    }
    const [ statement ] = body.getStatements();
    return TsMorphNode.isReturnStatement(statement) ? statement.getExpression() : undefined;
}

function returnExpressionFrom(functionLike: FunctionLike): Expression | undefined {
    if (TsMorphNode.isArrowFunction(functionLike)) {
        return arrowReturnExpressionFrom(functionLike);
    }
    return blockReturnExpressionFrom(functionLike);
}

function expressionIsPureReturnStructure(expression: Expression): boolean {
    return TsMorphNode.isObjectLiteralExpression(expression) ||
        TsMorphNode.isArrayLiteralExpression(expression) ||
        TsMorphNode.isArrowFunction(expression) ||
        TsMorphNode.isFunctionExpression(expression);
}

function expressionIsPureReturnValue(expression: Expression): boolean {
    const unwrapped = unwrapExpression(expression);
    return pureReturnLeafKinds.has(unwrapped.getKind()) || expressionIsPureReturnStructure(unwrapped);
}

function functionLikeIsPureBuilder(functionLike: FunctionLike): boolean {
    if (functionLike.getFullText().includes('@__NO_SIDE_EFFECTS__')) {
        return true;
    }
    const expression = returnExpressionFrom(functionLike);
    return expression !== undefined && expressionIsPureReturnValue(expression);
}

function callablePurity(functionLike: FunctionLike): ExportPurity {
    return functionLikeIsPureBuilder(functionLike) ? 'pure-callable' : 'unknown';
}

function propertyInitializerPurity(initializer: Expression): ExportPurity {
    if (TsMorphNode.isFunctionExpression(initializer) || TsMorphNode.isArrowFunction(initializer)) {
        return callablePurity(initializer);
    }
    return TsMorphNode.isObjectLiteralExpression(initializer) ? 'pure-object' : 'unknown';
}

function supportedObjectProperty(property: TsMorphNode): SupportedObjectProperty | undefined {
    if (TsMorphNode.isMethodDeclaration(property) || TsMorphNode.isPropertyAssignment(property)) {
        return property;
    }
    return undefined;
}

function propertyPurity(property: SupportedObjectProperty): ExportPurity {
    if (TsMorphNode.isMethodDeclaration(property)) {
        return callablePurity(property);
    }
    return propertyInitializerPurity(property.getInitializerOrThrow());
}

function propertyName(property: SupportedObjectProperty): string {
    const nameNode = property.getNameNode();
    return TsMorphNode.isStringLiteral(nameNode) ? nameNode.getLiteralText() : property.getName();
}

function functionLikeReturnObjectEntries(
    exportName: string,
    functionLike: FunctionLike,
    collectObjectEntries: ObjectEntriesCollector
): readonly ExportPurityEntry[] {
    const unwrapped = unwrapExpression(returnExpressionFrom(functionLike));
    return TsMorphNode.isObjectLiteralExpression(unwrapped)
        ? collectObjectEntries(exportName, unwrapped, undefined)
        : noExportEntries;
}

function methodReturnObjectEntries(
    propertyPath: string,
    property: TsMorphNode,
    collectObjectEntries: ObjectEntriesCollector
): readonly ExportPurityEntry[] {
    return TsMorphNode.isMethodDeclaration(property)
        ? functionLikeReturnObjectEntries(propertyPath, property, collectObjectEntries)
        : noExportEntries;
}

function propertyAssignmentReturnObjectEntries(
    propertyPath: string,
    property: TsMorphNode,
    collectObjectEntries: ObjectEntriesCollector
): readonly ExportPurityEntry[] {
    if (!TsMorphNode.isPropertyAssignment(property)) {
        return noExportEntries;
    }
    const initializer = property.getInitializerOrThrow();
    return TsMorphNode.isFunctionExpression(initializer) || TsMorphNode.isArrowFunction(initializer)
        ? functionLikeReturnObjectEntries(propertyPath, initializer, collectObjectEntries)
        : noExportEntries;
}

function objectPropertyExportEntries(
    exportName: string,
    property: TsMorphNode,
    collectObjectEntries: ObjectEntriesCollector
): readonly ExportPurityEntry[] {
    const supportedProperty = supportedObjectProperty(property);
    if (supportedProperty === undefined) {
        return noExportEntries;
    }
    const name = propertyName(supportedProperty);
    const propertyPath = `${exportName}.${name}`;
    return [
        [ propertyPath, propertyPurity(supportedProperty) ],
        ...methodReturnObjectEntries(propertyPath, supportedProperty, collectObjectEntries),
        ...propertyAssignmentReturnObjectEntries(propertyPath, supportedProperty, collectObjectEntries)
    ];
}

function objectLiteralExportEntries(
    exportName: string,
    initializer: ObjectLiteralExpression,
    selfPurity: ExportPurity | undefined
): readonly ExportPurityEntry[] {
    const entries: ExportPurityEntry[] = [];
    for (const property of initializer.getProperties()) {
        entries.push(...objectPropertyExportEntries(exportName, property, objectLiteralExportEntries));
    }
    if (selfPurity !== undefined) {
        entries.push([ exportName, selfPurity ]);
    }
    return entries;
}

function variableExportEntries(declaration: VariableDeclaration): readonly ExportPurityEntry[] {
    const initializer = declaration.getInitializer();
    const name = declaration.getName();
    if (TsMorphNode.isObjectLiteralExpression(initializer)) {
        return objectLiteralExportEntries(name, initializer, 'pure-object');
    }
    if (TsMorphNode.isFunctionExpression(initializer) || TsMorphNode.isArrowFunction(initializer)) {
        return [
            [ name, callablePurity(initializer) ],
            ...functionLikeReturnObjectEntries(name, initializer, objectLiteralExportEntries)
        ];
    }
    return noExportEntries;
}

function addVariableExport(declaration: VariableDeclaration, context: SummaryContext): void {
    for (const [ name, purity ] of variableExportEntries(declaration)) {
        context.exportPurities.set(name, purity);
    }
}

function mergeExports(
    context: SummaryContext,
    prefix: string,
    source: ReadonlyMap<string, ExportPurity>
): void {
    for (const [ key, value ] of source) {
        context.exportPurities.set(prefix === '' ? key : `${prefix}.${key}`, value);
    }
    if (prefix !== '') {
        context.exportPurities.set(prefix, 'pure-object');
    }
}

function resolvedModuleSummary(context: SummaryContext, moduleSpecifier: string): ExternalPuritySummary | undefined {
    const target = resolveModuleSourceFile(moduleSpecifier, context.sourceFile);
    return target === undefined ? undefined : context.buildSummary(target);
}

function sourceExportPrefix(sourceName: string): string {
    return `${sourceName}.`;
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
    const prefix = sourceExportPrefix(sourceName);
    for (const [ key, value ] of summary.exports) {
        if (key.startsWith(prefix)) {
            context.exportPurities.set(`${exportedName}.${key.slice(prefix.length)}`, value);
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
    context.exportPurities.set(exportedName, summary.exports.get(sourceName) ?? 'unknown');
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
    if (!TsMorphNode.isFunctionDeclaration(statement) || !statement.isExported()) {
        return;
    }
    const name = statement.getName();
    if (name !== undefined) {
        context.exportPurities.set(name, callablePurity(statement));
    }
}

function addVariableStatementExports(statement: Statement, context: SummaryContext): void {
    if (!TsMorphNode.isVariableStatement(statement) || !statement.isExported()) {
        return;
    }
    for (const declaration of statement.getDeclarations()) {
        addVariableExport(declaration, context);
    }
}

function mergeStatementExports(context: SummaryContext, statement: Statement): void {
    addFunctionExport(statement, context);
    addVariableStatementExports(statement, context);
    if (TsMorphNode.isExportDeclaration(statement)) {
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
    const exportPurities = new Map<string, ExportPurity>();
    const summary: ExternalPuritySummary = { exports: exportPurities };
    cache.set(sourceFile.getFilePath(), summary);
    const context = summaryContext(sourceFile, exportPurities, buildSummary);
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
    return origin.path.join('.');
}

export function exportPurityForOrigin(
    origin: ImportedExpressionOrigin,
    containingSourceFile: SourceFile
): ExportPurity {
    const sourceFile = resolveModuleSourceFile(origin.from, containingSourceFile);
    if (sourceFile === undefined) {
        return 'unknown';
    }
    return buildExternalPuritySummary(sourceFile).exports.get(exportKey(origin)) ?? 'unknown';
}
