import type { SourceFile } from 'ts-morph';
import { processStatement } from './declaration-removal.ts';
import { captureSurvivorsForStatement } from './survivor-capture.ts';

export type RemovalPlan = {
    readonly survivingNames: ReadonlySet<string>;
};

export type PositionAtom = {
    readonly originalStart: number;
    readonly originalEnd: number;
    readonly newStart: number;
};

export type RemovalResult = {
    readonly mutated: boolean;
    readonly atoms: readonly PositionAtom[];
};

export function applyRemovalPlan(sourceFile: SourceFile, plan: RemovalPlan): RemovalResult {
    const statements = sourceFile.getStatements();
    const survivors = statements.flatMap((statement) => {
        return captureSurvivorsForStatement(statement, plan.survivingNames);
    });
    let mutated = false;
    for (const statement of statements) {
        if (processStatement(statement, plan.survivingNames)) {
            mutated = true;
        }
    }
    const atoms = survivors.map((survivor) => {
        return {
            originalStart: survivor.originalStart,
            originalEnd: survivor.originalEnd,
            newStart: survivor.node.getStart()
        };
    });
    return { mutated, atoms };
}
