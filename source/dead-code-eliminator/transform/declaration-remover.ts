import type { SourceFile } from 'ts-morph';
import { buildTextTransformMap, type PositionAtom } from './atom-translator.ts';
import { processStatement, repairImportDeclarations } from './declaration-removal.ts';

export type RemovalPlan = {
    readonly survivingNames: ReadonlySet<string>;
};

export type RemovalResult = {
    readonly mutated: boolean;
    readonly atoms: readonly PositionAtom[];
};

export function applyRemovalPlan(sourceFile: SourceFile, plan: RemovalPlan): RemovalResult {
    const originalCode = sourceFile.getFullText();
    const statements = sourceFile.getStatements();
    let mutated = false;
    for (const statement of statements) {
        if (processStatement(statement, plan.survivingNames)) {
            mutated = true;
        }
    }
    if (repairImportDeclarations(sourceFile, plan.survivingNames)) {
        mutated = true;
    }
    const transformedCode = sourceFile.getFullText();
    return { mutated, atoms: buildTextTransformMap(originalCode, transformedCode).atoms };
}
