import type { Expression, Node as TsMorphNodeType, SourceFile } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import type { ConstantValue } from './constant-value.ts';

export type ConstantContext = {
    readonly activeExpressions: ReadonlySet<TsMorphNodeType>;
    readonly activeModuleGuards: ReadonlySet<string>;
    readonly activeSummaries: ReadonlySet<string>;
    readonly settings: DeadCodeEliminationSettings | undefined;
};

export type ExpressionConstantEvaluator = (
    expression: Expression,
    context: ConstantContext
) => ConstantValue | undefined;

export type ModuleSideEffectChecker = (
    sourceFile: SourceFile,
    context: ConstantContext
) => boolean;

export function childExpressionContext(
    context: ConstantContext,
    expression: TsMorphNodeType
): ConstantContext | undefined {
    if (context.activeExpressions.has(expression)) {
        return undefined;
    }
    return {
        ...context,
        activeExpressions: new Set([ ...context.activeExpressions, expression ])
    };
}

export function childModuleGuardContext(
    context: ConstantContext,
    filePath: string
): ConstantContext | undefined {
    if (context.activeModuleGuards.has(filePath)) {
        return undefined;
    }
    return {
        ...context,
        activeModuleGuards: new Set([ ...context.activeModuleGuards, filePath ])
    };
}

export function childSummaryContext(
    context: ConstantContext,
    filePath: string
): ConstantContext | undefined {
    if (context.activeSummaries.has(filePath)) {
        return undefined;
    }
    return {
        ...context,
        activeSummaries: new Set([ ...context.activeSummaries, filePath ])
    };
}

export function noActiveContext(settings: DeadCodeEliminationSettings | undefined): ConstantContext {
    return {
        activeExpressions: new Set<TsMorphNodeType>(),
        activeModuleGuards: new Set<string>(),
        activeSummaries: new Set<string>(),
        settings
    };
}
