import type { DeadCodeEliminationTrace } from '../trace.ts';

export type RemovalPlan = {
    readonly bundleName: string;
    readonly inputFilePath: string;
    readonly targetFilePath: string;
    readonly survivingNames: ReadonlySet<string>;
    readonly trace: DeadCodeEliminationTrace;
};
