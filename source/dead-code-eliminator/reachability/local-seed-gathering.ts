import type { SourceFile, Statement } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../../config/dead-code-elimination-settings.ts';
import { bindingId, type FileBindingSet } from './binding-id.ts';
import { collectIdentifierTargets, type DeclarationNodeIndex } from './identifier-target-collector.ts';
import { collectImpureStatements } from './impure-statements.ts';

export type FileBindings = FileBindingSet & {
    readonly sourceFile: Readonly<SourceFile>;
};

function addStatementSeeds(
    statements: readonly Statement[],
    declarationIndex: DeclarationNodeIndex,
    seeds: Set<string>
): void {
    for (const statement of statements) {
        for (const target of collectIdentifierTargets(statement, declarationIndex)) {
            seeds.add(target);
        }
    }
}

export function gatherLocalSeeds(
    files: readonly FileBindings[],
    entryPointFilePaths: ReadonlySet<string>,
    declarationIndex: DeclarationNodeIndex,
    deadCodeElimination: DeadCodeEliminationSettings | undefined
): Set<string> {
    const seeds = new Set<string>();
    for (const file of files) {
        const isEntry = entryPointFilePaths.has(file.sourceFilePath);
        for (const binding of file.bindings) {
            if (isEntry && binding.isExported) {
                seeds.add(bindingId(file.sourceFilePath, binding.name));
            }
        }
        addStatementSeeds(collectImpureStatements(file.sourceFile, deadCodeElimination), declarationIndex, seeds);
    }
    return seeds;
}
