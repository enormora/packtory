import { Node as TsMorphNode, type SourceFile, type Statement } from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../../config/dead-code-elimination-settings.ts';
import { bindingId, type FileBindingSet } from './binding-id.ts';
import { collectIdentifierTargets, type DeclarationNodeIndex } from './identifier-target-collector.ts';
import { collectImpureStatements } from './impure-statements.ts';

export type FileBindings = FileBindingSet & {
    readonly sourceFile: Readonly<SourceFile>;
};

function statementSeeds(
    statements: readonly Statement[],
    declarationIndex: DeclarationNodeIndex
): readonly string[] {
    return statements.flatMap(function (statement) {
        return Array.from(collectIdentifierTargets(statement, declarationIndex));
    });
}

function entryPointExportDeclarationSeeds(
    file: FileBindings,
    declarationIndex: DeclarationNodeIndex
): readonly string[] {
    return file.sourceFile.getStatements().flatMap(function (statement) {
        return TsMorphNode.isExportDeclaration(statement)
            ? Array.from(collectIdentifierTargets(statement, declarationIndex))
            : [];
    });
}

function exportedBindingSeeds(file: FileBindings, isEntry: boolean): readonly string[] {
    if (!isEntry) {
        return [];
    }
    return file.bindings.flatMap(function (binding) {
        return binding.isExported ? [ bindingId(file.sourceFilePath, binding.name) ] : [];
    });
}

function seedsForFile(
    file: FileBindings,
    isEntry: boolean,
    declarationIndex: DeclarationNodeIndex,
    deadCodeElimination: DeadCodeEliminationSettings | undefined
): readonly string[] {
    const impureStatements = collectImpureStatements(file.sourceFile, deadCodeElimination);
    return [
        ...exportedBindingSeeds(file, isEntry),
        ...isEntry ? entryPointExportDeclarationSeeds(file, declarationIndex) : [],
        ...statementSeeds(impureStatements, declarationIndex)
    ];
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
        const fileSeeds = seedsForFile(file, isEntry, declarationIndex, deadCodeElimination);
        for (const seed of fileSeeds) {
            seeds.add(seed);
        }
    }
    return seeds;
}
