import type { DeadCodeEliminator, EliminationInput } from '../dead-code-eliminator/analyzed-bundle.ts';
import { createDeadCodeEliminator, type InspectableDeadCodeEliminator } from '../dead-code-eliminator/eliminator.ts';
import type { DeadCodeEliminationTrace } from '../dead-code-eliminator/trace.ts';
import {
    createDeadCodeEliminationTraceCollector,
    formatDeadCodeEliminationTrace
} from './dead-code-elimination-trace-fixtures.ts';
import { createProject } from './typescript-project.ts';

export type TestEliminator = DeadCodeEliminator;
type DeadCodeEliminationTraceCollector = NonNullable<DeadCodeEliminationTrace>['collector'];

const noopProvider = {
    emit(): void {
        return undefined;
    },
    hasSubscribers(): boolean {
        return false;
    }
};

export function createTestEliminator(): InspectableDeadCodeEliminator {
    return createDeadCodeEliminator({
        createProject() {
            return createProject();
        },
        progressBroadcaster: noopProvider,
        trace: undefined
    });
}

export function createTracedTestEliminator(
    collector: DeadCodeEliminationTraceCollector
): InspectableDeadCodeEliminator {
    return createDeadCodeEliminator({
        createProject() {
            return createProject();
        },
        progressBroadcaster: noopProvider,
        trace: { collector }
    });
}

export async function collectDeadCodeEliminationTrace(inputs: readonly EliminationInput[]): Promise<string> {
    const trace = createDeadCodeEliminationTraceCollector();
    try {
        await createTracedTestEliminator(trace.collector).eliminate(inputs);
    } catch {
        return formatDeadCodeEliminationTrace(trace.events);
    }
    return formatDeadCodeEliminationTrace(trace.events);
}
