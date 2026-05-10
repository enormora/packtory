import { Node as TsMorphNode, type SourceFile, type Statement } from 'ts-morph';
import { classifySideEffects } from '../side-effect-classifier.ts';

export function collectImpureStatements(sourceFile: Readonly<SourceFile>): readonly Statement[] {
    const impureLines = new Set<number>();
    for (const statement of classifySideEffects(sourceFile)) {
        impureLines.add(statement.line);
    }
    return sourceFile.getStatements().filter((statement) => {
        return impureLines.has(statement.getStartLineNumber()) && !TsMorphNode.isImportDeclaration(statement);
    });
}
