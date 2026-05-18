import type { TimeoutMutant } from './timeout-mutant-collector.ts';

export function formatMutationTimeoutError(timeouts: readonly TimeoutMutant[]): string | undefined {
    if (timeouts.length === 0) {
        return undefined;
    }

    const summary = timeouts.map((timeout) => {
        return `- ${timeout.filePath}:${timeout.line}:${timeout.column}`;
    });

    return [
        `Mutation report contains ${timeouts.length} timeout mutant${timeouts.length === 1 ? '' : 's'}.`,
        ...summary
    ].join('\n');
}
