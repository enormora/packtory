import type { SourceFile } from 'ts-morph';
import { buildTextTransformMap, type PositionAtom } from './atom-translator.ts';
import { processStatement, repairImportDeclarations } from './declaration-removal.ts';
import type { RemovalPlan } from './declaration-removal-plan.ts';

export type RemovalResult = {
    readonly mutated: boolean;
    readonly atoms: readonly PositionAtom[];
};

export function applyRemovalPlan(sourceFile: SourceFile, plan: RemovalPlan): RemovalResult {
    const originalCode = sourceFile.getFullText();
    const statements = sourceFile.getStatements();
    let mutated = false;
    for (const statement of statements) {
        if (processStatement(statement, plan)) {
            mutated = true;
        }
    }
    if (repairImportDeclarations(sourceFile, plan)) {
        mutated = true;
    }
    const transformedCode = sourceFile.getFullText();
    return { mutated, atoms: buildTextTransformMap(originalCode, transformedCode).atoms };
}
