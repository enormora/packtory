import type { LinkedBundle } from '../linker/linked-bundle.ts';
import type { FileDecision, ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { AnalyzedBundle } from './analyzed-bundle.ts';

function buildFileDecisions(original: LinkedBundle, analyzed: AnalyzedBundle): readonly FileDecision[] {
    const analyzedBySourcePath = new Map(
        analyzed.contents.map((entry) => {
            return [entry.fileDescription.sourceFilePath, entry] as const;
        })
    );
    return original.contents.map((entry): FileDecision => {
        const emitted = analyzedBySourcePath.get(entry.fileDescription.sourceFilePath);
        const sourceBytes = Buffer.byteLength(entry.fileDescription.content);
        if (emitted === undefined) {
            return {
                path: entry.fileDescription.sourceFilePath,
                decision: 'eliminated',
                reason: 'not-emitted-after-analysis',
                sourceBytes
            };
        }
        const outputBytes = Buffer.byteLength(emitted.fileDescription.content);
        if (entry.fileDescription.content !== emitted.fileDescription.content) {
            return {
                path: entry.fileDescription.sourceFilePath,
                decision: 'transformed',
                reason: 'rewritten-after-analysis',
                sourceBytes,
                outputBytes
            };
        }
        return {
            path: entry.fileDescription.sourceFilePath,
            decision: 'kept',
            reason: 'reachable',
            sourceBytes
        };
    });
}

export function maybeEmitElimination(
    broadcaster: ProgressBroadcastProvider,
    originalBundles: readonly LinkedBundle[],
    analyzed: readonly AnalyzedBundle[]
): void {
    if (!broadcaster.hasSubscribers('eliminationCompleted')) {
        return;
    }
    broadcaster.emit('eliminationCompleted', {
        perBundle: analyzed.map((bundle, index) => {
            const originalBundle = originalBundles[index];
            if (originalBundle === undefined) {
                throw new Error(`Original bundle missing for analyzed bundle "${bundle.name}"`);
            }
            return {
                packageName: bundle.name,
                files: buildFileDecisions(originalBundle, bundle),
                droppedSymbols: [],
                seeds: []
            };
        })
    });
}
