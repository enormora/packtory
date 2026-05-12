import type { FileDecision } from '../progress/event-payloads.ts';
import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { AnalyzedBundle } from './analyzed-bundle.ts';

function buildFileDecisions(bundle: AnalyzedBundle): readonly FileDecision[] {
    return bundle.contents.map((entry): FileDecision => {
        return {
            path: entry.fileDescription.sourceFilePath,
            decision: 'kept',
            reason: 'reachable',
            sourceBytes: entry.fileDescription.content.length
        };
    });
}

export function maybeEmitElimination(
    broadcaster: ProgressBroadcastProvider,
    analyzed: readonly AnalyzedBundle[]
): void {
    if (!broadcaster.hasSubscribers('eliminationCompleted')) {
        return;
    }
    broadcaster.emit('eliminationCompleted', {
        perBundle: analyzed.map((bundle) => {
            return {
                packageName: bundle.name,
                files: buildFileDecisions(bundle),
                droppedSymbols: [],
                seeds: []
            };
        })
    });
}
