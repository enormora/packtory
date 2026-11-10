import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type Expression,
    type SourceFile,
    type VariableDeclaration
} from 'ts-morph';
import { constantStatement } from './constant-binding.ts';
import { declarationOf } from './evaluation-context.ts';
import { createBoundedEvaluator } from './local-call.ts';
import type { EvaluatedValue } from './primitive-value.ts';
import { primitiveResult } from './abstract-value.ts';

export type PrimitiveEvaluator = (expression: Expression) => EvaluatedValue | undefined;
export type SourceEvaluation = {
    readonly primitiveValue: PrimitiveEvaluator;
    readonly canDiscard: (expression: Expression) => boolean;
};

function declarationValue(declaration: VariableDeclaration, evaluate: PrimitiveEvaluator): EvaluatedValue | undefined {
    const name = declaration.getNameNode();
    if (!TypeScriptMorphNode.isIdentifier(name) || declarationOf(name) !== declaration) {
        return undefined;
    }
    const initializer = declaration.getInitializer();
    return initializer === undefined || constantStatement(declaration) === undefined
        ? undefined
        : evaluate(initializer);
}

export function createSourceEvaluation(sourceFile: SourceFile): SourceEvaluation {
    const values = new Map<VariableDeclaration, EvaluatedValue>();
    const evaluate = createBoundedEvaluator(sourceFile, values);
    const primitiveValue: PrimitiveEvaluator = function (expression) {
        return primitiveResult(evaluate(expression));
    };
    for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
        const value = declarationValue(declaration, primitiveValue);
        if (value !== undefined) {
            values.set(declaration, value);
        }
    }
    return {
        primitiveValue,
        canDiscard(expression) {
            return evaluate(expression) !== undefined;
        }
    };
}
