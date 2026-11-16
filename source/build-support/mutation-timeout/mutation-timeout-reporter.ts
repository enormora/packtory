import path from 'node:path';
import type { MutantResult } from '@stryker-mutator/api/core';
import type { Reporter } from '@stryker-mutator/api/report';

export type MutationTimeoutReporter = Required<Pick<Reporter, 'onMutantTested'>>;

export function createMutationTimeoutReporter(
    reportFailure: (message: string) => void,
    sourceRoot: string
): MutationTimeoutReporter {
    return {
        onMutantTested(result: Readonly<MutantResult>): void {
            if (result.status !== 'Timeout' && result.status !== 'Survived') {
                return;
            }
            const filePath = path.relative(sourceRoot, result.fileName);
            const { line, column } = result.location.start;
            const sourceLocation = `${filePath}:${line}:${column}`;
            const outcome = result.status === 'Timeout' ? 'timed out' : 'survived';
            const staticMarker = result.static === true ? ' [static]' : '';
            reportFailure(
                `Mutation ${outcome}: ${sourceLocation} (${result.id}, ${result.mutatorName})${staticMarker}`
            );
        }
    };
}
