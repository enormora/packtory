import { Node as TypeScriptMorphNode, type Identifier, type PropertyAccessExpression } from 'ts-morph';
import type { SourcePreparation } from '../../source-transformation/source-preparation.ts';
import type { PrimitiveEvaluator } from '../evaluation/constant-evaluation.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { expressionIsValueRead } from './expression-read.ts';
import { primitiveSource } from './primitive-source.ts';

export function specializeImportedValues(preparation: SourcePreparation, evaluateImport: PrimitiveEvaluator): void {
    const { sourceFile } = preparation;
    if (hasDynamicScope(sourceFile)) {
        return;
    }
    let previousEnd = 0;
    const candidates = sourceFile.getDescendants().filter(
        function (node): node is Identifier | PropertyAccessExpression {
            return TypeScriptMorphNode.isIdentifier(node) || TypeScriptMorphNode.isPropertyAccessExpression(node);
        }
    );
    const edits = candidates.flatMap(function (expression) {
        if (expression.getStart() < previousEnd || !expressionIsValueRead(expression)) {
            return [];
        }
        const result = evaluateImport(expression);
        if (result === undefined) {
            return [];
        }
        previousEnd = expression.getEnd();
        return [ { start: expression.getStart(), end: expression.getEnd(), content: `(${primitiveSource(result)})` } ];
    });
    preparation.applyEdits(edits);
}
