import { Node as TsMorphNode, type SourceFile, type Statement } from 'ts-morph';
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

function addEntryPointExportDeclarationSeeds(
    file: FileBindings,
    declarationIndex: DeclarationNodeIndex,
    seeds: Set<string>
): void {
    for (const statement of file.sourceFile.getStatements()) {
        if (TsMorphNode.isExportDeclaration(statement)) {
            for (const target of collectIdentifierTargets(statement, declarationIndex)) {
                seeds.add(target);
            }
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
        if (isEntry) {
            addEntryPointExportDeclarationSeeds(file, declarationIndex, seeds);
        }
        addStatementSeeds(collectImpureStatements(file.sourceFile, deadCodeElimination), declarationIndex, seeds);
    }
    return seeds;
}
