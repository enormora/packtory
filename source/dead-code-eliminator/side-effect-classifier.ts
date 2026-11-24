import { Node as TypeScriptMorphNode, type SourceFile, type Statement } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../configuration/dead-code-elimination-settings.ts';
import type { ExpressionPurityChecker } from './imported-expression-origin.ts';
import { createExpressionPurityChecker } from './expression-purity.ts';
import type { ClassPropertyKeyResolver } from './class-purity.ts';
import { truthinessOf } from './evaluation/abstract-value.ts';
import { createRuntimeSourceEvaluation, type SourceEvaluation } from './evaluation/constant-evaluation.ts';
import { evaluationEnvironmentOf } from './evaluation/evaluation-environment.ts';
import { statementClassifierFor } from './statement-classifiers.ts';
import { describeControlFlowStatementKind, pureDeclarationKinds } from './syntax-kind-sets.ts';

type ClassifiedSideEffect = {
    readonly statement: Statement;
    readonly kind: string;
};

type SourceClassification = {
    readonly isPure: ExpressionPurityChecker;
    readonly evaluation: SourceEvaluation;
    readonly propertyKeyFor: ClassPropertyKeyResolver;
};

function isStaticallyUnreachableIfStatement(statement: Statement, evaluation: SourceEvaluation): boolean {
    if (!TypeScriptMorphNode.isIfStatement(statement) || statement.getElseStatement() !== undefined) {
        return false;
    }
    const condition = evaluation.knownValue(statement.getExpression());
    return condition !== undefined && truthinessOf(condition) === false;
}

function classifyResidualStatement(statement: Statement, classification: SourceClassification): string | undefined {
    const kind = statement.getKind();
    const controlFlowKind = describeControlFlowStatementKind(kind);
    if (controlFlowKind !== undefined) {
        return controlFlowKind;
    }
    const classifier = statementClassifierFor(kind);
    if (classifier !== undefined) {
        return classifier(statement, classification.isPure, classification.propertyKeyFor);
    }
    return 'unknown statement';
}

function classifyTopLevelStatement(statement: Statement, classification: SourceClassification): string | undefined {
    if (
        pureDeclarationKinds.has(statement.getKind()) ||
        isStaticallyUnreachableIfStatement(statement, classification.evaluation)
    ) {
        return undefined;
    }
    return classifyResidualStatement(statement, classification);
}

function createSourceClassification(sourceFile: SourceFile): SourceClassification {
    const evaluation = createRuntimeSourceEvaluation(sourceFile);
    return {
        isPure: createExpressionPurityChecker(),
        evaluation,
        propertyKeyFor(expression) {
            const value = evaluation.primitiveValue(expression) ??
                evaluationEnvironmentOf(sourceFile).readImportedConstant(expression);
            return value === undefined ? undefined : String(value.value);
        }
    };
}

export type SideEffectClassifier = (
    sourceFile: Readonly<SourceFile>,
    settings: DeadCodeEliminationSettings | undefined
) => readonly ClassifiedSideEffect[];

export function createSideEffectClassifier(): SideEffectClassifier {
    return function (sourceFile) {
        const classification = createSourceClassification(sourceFile.getSourceFile());
        return sourceFile.getStatements().flatMap(function (statement) {
            const kind = classifyTopLevelStatement(statement, classification);
            return kind === undefined ? [] : { statement, kind };
        });
    };
}
