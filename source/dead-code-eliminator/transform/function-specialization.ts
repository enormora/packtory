import { takeWhile } from 'remeda';
import { Node as TypeScriptMorphNode, type Block, type Node as TypeScriptMorphNodeType } from 'ts-morph';
import type { SourceTextEdit } from '../../source-transformation/text-edits.ts';
import { localFunction } from '../evaluation/call-target.ts';
import { evaluateLocalFunction } from '../evaluation/function-evaluation.ts';
import type { EvaluatedValue } from '../evaluation/primitive-value.ts';
import { primitiveSource } from './primitive-source.ts';
import { sourceReplacement } from './source-replacement.ts';

function bodyHasComputation(body: Block): boolean {
    const statements = body.getStatements().filter(function (statement) {
        return !TypeScriptMorphNode.isExpressionStatement(statement) ||
            !TypeScriptMorphNode.isStringLiteral(statement.getExpression());
    });
    const [ first ] = statements;
    return statements.length > 1 || first !== undefined && !TypeScriptMorphNode.isReturnStatement(first);
}

function constantBodyEdits(body: Block, value: EvaluatedValue): readonly SourceTextEdit[] {
    const directives = takeWhile(body.getStatements(), function (statement) {
        return TypeScriptMorphNode.isExpressionStatement(statement) &&
            TypeScriptMorphNode.isStringLiteral(statement.getExpression());
    });
    const result = value.value === undefined ? '}' : `return ${primitiveSource(value)};}`;
    return sourceReplacement(body, [ '{', ...directives, result ]);
}

export function functionSpecializationEdits(node: TypeScriptMorphNodeType): readonly SourceTextEdit[] {
    const target = localFunction(node);
    if (target === undefined) {
        return [];
    }
    const body = target.getBody();
    if (!TypeScriptMorphNode.isBlock(body) || !bodyHasComputation(body)) {
        return [];
    }
    const value = evaluateLocalFunction(target);
    if (value === undefined) {
        return [];
    }
    return constantBodyEdits(body, value);
}
