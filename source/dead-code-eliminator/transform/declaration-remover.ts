import type { SourceFile } from 'ts-morph';
import { buildTextTransformMap, type PositionAtom } from '../../source-transformation/text-edits.ts';
import {
    processStatements,
    repairImportDeclarations,
    hasModuleSyntax,
    type RemovalPlan
} from './declaration-removal.ts';
import { removeUnusedExports } from './export-removal.ts';
import { removeRedundantEmptyStatements } from './empty-statements.ts';

export type RemovalResult = {
    readonly mutated: boolean;
    readonly atoms: readonly PositionAtom[];
};

export function applyRemovalPlan(sourceFile: SourceFile, plan: RemovalPlan): RemovalResult {
    const originalCode = sourceFile.getFullText();
    const wasModule = hasModuleSyntax(sourceFile);
    removeUnusedExports(sourceFile, plan);
    processStatements(sourceFile, plan);
    repairImportDeclarations(sourceFile, plan, wasModule);
    removeRedundantEmptyStatements(sourceFile);
    const transformedCode = sourceFile.getFullText();
    return {
        mutated: transformedCode !== originalCode,
        atoms: buildTextTransformMap(originalCode, transformedCode).atoms
    };
}
