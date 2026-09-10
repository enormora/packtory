import {
    Node as TsMorphNode,
    VariableDeclarationKind,
    type ExportDeclaration,
    type ExportSpecifier,
    type Project,
    type SourceFile,
    type Statement,
    type VariableDeclaration
} from 'ts-morph';
import { bindingsFromDeclaration, type PropertyNameKeyResolver } from './constant-binding.ts';
import {
    childSummaryContext,
    type ConstantContext,
    type ExpressionConstantEvaluator,
    type ModuleSideEffectChecker
} from './constant-context.ts';
import { objectConstant, propertyValue, type ConstantValue } from './constant-value.ts';
import type { ImportedExpressionOrigin } from './imported-expression-origin.ts';
import { resolvedRuntimeSourceFile } from './runtime-source-file.ts';

type ConstantSummary = {
    readonly exports: ReadonlyMap<string, ConstantValue>;
};
type ConstantSummaryRecorder = {
    readonly get: (key: string) => ConstantValue | undefined;
    readonly read: () => ReadonlyMap<string, ConstantValue>;
    readonly set: (key: string, value: ConstantValue) => unknown;
};
type MutableConstantSummary = {
    readonly exports: ConstantSummaryRecorder;
    readonly locals: ConstantSummaryRecorder;
};
type ConstantSummaryBuilder = (sourceFile: SourceFile, context: ConstantContext) => ConstantSummary;
export type ConstantSummaryDependencies = {
    readonly evaluate: ExpressionConstantEvaluator;
    readonly guardModuleSideEffects: boolean;
    readonly moduleHasSideEffects: ModuleSideEffectChecker;
    readonly propertyNameKey: PropertyNameKeyResolver;
};
type SummaryCollection = {
    readonly buildSummary: ConstantSummaryBuilder;
    readonly context: ConstantContext;
    readonly dependencies: ConstantSummaryDependencies;
    readonly summary: MutableConstantSummary;
};

function isProjectSummaryStore(value: unknown): value is Map<string, ConstantSummary> {
    return value instanceof Map;
}

function projectSummaryCache(project: Project): Map<string, ConstantSummary> {
    const stored: unknown = Reflect.get(project, projectSummaryCache.name);
    const cache = isProjectSummaryStore(stored) ? stored : new Map<string, ConstantSummary>();
    Reflect.set(project, projectSummaryCache.name, cache);
    return cache;
}

function constantSummaryRecorder(): ConstantSummaryRecorder {
    const constants = new Map<string, ConstantValue>();
    return {
        get(key) {
            return constants.get(key);
        },
        read() {
            return constants;
        },
        set(key, value) {
            return constants.set(key, value);
        }
    };
}

function pathValue(value: ConstantValue | undefined, path: readonly string[]): ConstantValue | undefined {
    let current = value;
    for (const segment of path) {
        current = current === undefined ? undefined : propertyValue(current, segment);
    }
    return current;
}

function moduleHasBlockedSideEffects(sourceFile: SourceFile, collection: SummaryCollection): boolean {
    return collection.dependencies.guardModuleSideEffects &&
        collection.dependencies.moduleHasSideEffects(sourceFile, collection.context);
}

function collectConstantBindings(
    statement: Statement,
    declaration: VariableDeclaration,
    value: ConstantValue,
    collection: SummaryCollection
): void {
    const resolution = {
        context: collection.context,
        evaluate: collection.dependencies.evaluate,
        propertyNameKey: collection.dependencies.propertyNameKey
    };
    for (const [ name, bindingValue ] of bindingsFromDeclaration(declaration, value, resolution)) {
        collection.summary.locals.set(name, bindingValue);
        if (TsMorphNode.isVariableStatement(statement) && statement.isExported()) {
            collection.summary.exports.set(name, bindingValue);
        }
    }
}

function collectLocalConstants(
    statement: Statement,
    collection: SummaryCollection
): void {
    if (
        !TsMorphNode.isVariableStatement(statement) || statement.getDeclarationKind() !== VariableDeclarationKind.Const
    ) {
        return;
    }
    for (const declaration of statement.getDeclarations()) {
        const initializer = declaration.getInitializer();
        const value = initializer === undefined
            ? undefined
            : collection.dependencies.evaluate(initializer, collection.context);
        if (value !== undefined) {
            collectConstantBindings(statement, declaration, value, collection);
        }
    }
}

function collectDefaultExport(
    statement: Statement,
    collection: SummaryCollection
): void {
    if (!TsMorphNode.isExportAssignment(statement) || statement.isExportEquals()) {
        return;
    }
    const value = collection.dependencies.evaluate(statement.getExpression(), collection.context);
    if (value !== undefined) {
        collection.summary.exports.set('default', value);
    }
}

function resolvedPureModuleSummary(
    declaration: ExportDeclaration,
    collection: SummaryCollection
): ConstantSummary | undefined {
    const moduleSpecifier = declaration.getModuleSpecifierValue();
    const target = moduleSpecifier === undefined
        ? undefined
        : resolvedRuntimeSourceFile(moduleSpecifier, declaration.getSourceFile());
    if (target === undefined || moduleHasBlockedSideEffects(target, collection)) {
        return undefined;
    }
    return collection.buildSummary(target, collection.context);
}

function mergeNamespaceExport(
    declaration: ExportDeclaration,
    target: ConstantSummary,
    summary: MutableConstantSummary
): boolean {
    const namespace = declaration.getNamespaceExport();
    if (namespace === undefined) {
        return false;
    }
    summary.exports.set(namespace.getName(), objectConstant(target.exports));
    return true;
}

function mergeStarExport(target: ConstantSummary, summary: MutableConstantSummary): void {
    for (const [ name, value ] of target.exports) {
        summary.exports.set(name, value);
    }
}

function mergeNamedExport(
    namedExport: ExportSpecifier,
    target: ConstantSummary,
    summary: MutableConstantSummary
): void {
    const value = target.exports.get(namedExport.getName());
    const alias = namedExport.getAliasNode()?.getText() ?? namedExport.getName();
    if (value !== undefined) {
        summary.exports.set(alias, value);
    }
}

function collectModuleExport(
    declaration: ExportDeclaration,
    collection: SummaryCollection
): void {
    const target = resolvedPureModuleSummary(declaration, collection);
    if (target === undefined || mergeNamespaceExport(declaration, target, collection.summary)) {
        return;
    }
    const namedExports = declaration.getNamedExports();
    if (namedExports.length === 0) {
        mergeStarExport(target, collection.summary);
        return;
    }
    for (const namedExport of namedExports) {
        mergeNamedExport(namedExport, target, collection.summary);
    }
}

function collectLocalExport(declaration: ExportDeclaration, summary: MutableConstantSummary): void {
    if (declaration.getModuleSpecifierValue() !== undefined) {
        return;
    }
    for (const namedExport of declaration.getNamedExports()) {
        const value = summary.locals.get(namedExport.getName());
        const alias = namedExport.getAliasNode()?.getText() ?? namedExport.getName();
        if (value !== undefined) {
            summary.exports.set(alias, value);
        }
    }
}

function collectExports(
    sourceFile: SourceFile,
    collection: SummaryCollection
): void {
    for (const statement of sourceFile.getStatements()) {
        collectDefaultExport(statement, collection);
        if (TsMorphNode.isExportDeclaration(statement)) {
            collectModuleExport(statement, collection);
            collectLocalExport(statement, collection.summary);
        }
    }
}

function createConstantSummary(
    sourceFile: SourceFile,
    context: ConstantContext,
    dependencies: ConstantSummaryDependencies,
    buildSummary: ConstantSummaryBuilder
): ConstantSummary {
    const summary: MutableConstantSummary = {
        exports: constantSummaryRecorder(),
        locals: constantSummaryRecorder()
    };
    const collection = { buildSummary, context, dependencies, summary };
    for (const statement of sourceFile.getStatements()) {
        collectLocalConstants(statement, collection);
    }
    collectExports(sourceFile, collection);
    return { exports: summary.exports.read() };
}

function buildConstantSummary(
    sourceFile: SourceFile,
    context: ConstantContext,
    dependencies: ConstantSummaryDependencies
): ConstantSummary {
    const cache = projectSummaryCache(sourceFile.getProject());
    const cached = cache.get(sourceFile.getFilePath());
    if (cached !== undefined) {
        return cached;
    }
    const nextContext = childSummaryContext(context, sourceFile.getFilePath());
    if (nextContext === undefined) {
        return { exports: new Map<string, ConstantValue>() };
    }
    const summary = createConstantSummary(sourceFile, nextContext, dependencies, function (target, summaryContext) {
        return buildConstantSummary(target, summaryContext, dependencies);
    });
    cache.set(sourceFile.getFilePath(), summary);
    return summary;
}

export function exportedConstantForOrigin(
    origin: ImportedExpressionOrigin,
    containingSourceFile: SourceFile,
    context: ConstantContext,
    dependencies: ConstantSummaryDependencies
): ConstantValue | undefined {
    const sourceFile = resolvedRuntimeSourceFile(origin.from, containingSourceFile);
    if (
        sourceFile === undefined ||
        dependencies.guardModuleSideEffects && dependencies.moduleHasSideEffects(sourceFile, context)
    ) {
        return undefined;
    }
    const summary = buildConstantSummary(sourceFile, context, dependencies);
    const [ name, ...path ] = origin.path;
    const value = name === undefined ? objectConstant(summary.exports) : summary.exports.get(name);
    return pathValue(value, path);
}
