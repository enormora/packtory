import { match } from 'ts-pattern';
import type { DeadCodeEliminationTrace } from '../dead-code-eliminator/trace.ts';

type DeadCodeEliminationTraceCollector = NonNullable<DeadCodeEliminationTrace>['collector'];
type DeadCodeEliminationTraceEvent = Parameters<DeadCodeEliminationTraceCollector['record']>[0];

export type CollectedDeadCodeEliminationTrace = {
    readonly collector: DeadCodeEliminationTraceCollector;
    readonly events: readonly DeadCodeEliminationTraceEvent[];
};

export function createDeadCodeEliminationTraceCollector(): CollectedDeadCodeEliminationTrace {
    const events: DeadCodeEliminationTraceEvent[] = [];
    return {
        collector: {
            record(event) {
                events.push(event);
            }
        },
        events
    };
}

function formatTraceEvent(event: DeadCodeEliminationTraceEvent): string {
    return match<DeadCodeEliminationTraceEvent, string>(event)
        .with({ type: 'binding-removed' }, function (entry) {
            return `${entry.bundleName} removed binding ${entry.bindingId} from ${entry.inputFilePath}`;
        })
        .with({ type: 'cross-bundle-seed-added' }, function (entry) {
            return [
                `${entry.bundleName} cross-bundle seed ${entry.bindingId}`,
                entry.reason,
                `from ${entry.sourceBundleName} ${entry.inputFilePath}:${entry.line}`,
                `via ${entry.moduleSpecifier}`
            ]
                .join(' ');
        })
        .with({ type: 'edge-added' }, function (entry) {
            return `${entry.bundleName} edge ${entry.fromBindingId} -> ${entry.toBindingId} ${entry.reason}`;
        })
        .with({ type: 'file-pruned' }, function (entry) {
            return `${entry.bundleName} pruned ${entry.targetFilePath} ${entry.pruneKind} from ${entry.inputFilePath}`;
        })
        .with({ repairKind: 'binding-dropped', type: 'import-repaired' }, function (entry) {
            return [
                `${entry.bundleName} repaired import ${entry.moduleSpecifier}`,
                entry.repairKind,
                entry.bindingName,
                `in ${entry.targetFilePath}`
            ]
                .join(' ');
        })
        .with({ type: 'import-repaired' }, function (entry) {
            return [
                `${entry.bundleName} repaired import ${entry.moduleSpecifier}`,
                entry.repairKind,
                `in ${entry.targetFilePath}`
            ]
                .join(' ');
        })
        .with({ type: 'local-seed-added' }, function (entry) {
            return [
                `${entry.bundleName} local seed ${entry.bindingId}`,
                entry.reason,
                `${entry.inputFilePath}:${entry.line}`
            ]
                .join(' ');
        })
        .exhaustive();
}

export function formatDeadCodeEliminationTrace(events: readonly DeadCodeEliminationTraceEvent[]): string {
    return events.map(formatTraceEvent).join('\n');
}
