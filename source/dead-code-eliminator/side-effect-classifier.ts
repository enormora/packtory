import type { SourceFile, Statement } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import type { SideEffectStatement } from './analyzed-bundle.ts';
import { statementClassifierFor } from './statement-classifiers.ts';
import { describeControlFlowStatementKind, pureDeclarationKinds } from './syntax-kind-sets.ts';

function classifyTopLevelStatement(
    statement: Statement,
    settings: DeadCodeEliminationSettings | undefined
): string | undefined {
    const kind = statement.getKind();
    if (pureDeclarationKinds.has(kind)) {
        return undefined;
    }
    const controlFlowKind = describeControlFlowStatementKind(kind);
    if (controlFlowKind !== undefined) {
        return controlFlowKind;
    }
    const classifier = statementClassifierFor(kind);
    if (classifier !== undefined) {
        return classifier(statement, settings);
    }
    return 'unknown statement';
}

export function classifySideEffects(
    sourceFile: Readonly<SourceFile>,
    settings?: DeadCodeEliminationSettings
): readonly SideEffectStatement[] {
    return sourceFile.getStatements().flatMap((statement) => {
        const kind = classifyTopLevelStatement(statement, settings);
        if (kind === undefined) {
            return [];
        }
        return [{ line: statement.getStartLineNumber(), kind }];
    });
}
