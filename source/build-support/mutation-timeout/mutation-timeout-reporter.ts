import path from 'node:path';
import type { MutantResult } from '@stryker-mutator/api/core';
import type { Reporter } from '@stryker-mutator/api/report';

export type MutationTimeoutReporter = Required<Pick<Reporter, 'onMutantTested'>>;

export function createMutationTimeoutReporter(
    reportTimeout: (message: string) => void,
    sourceRoot: string
): MutationTimeoutReporter {
    return {
        onMutantTested(result: Readonly<MutantResult>): void {
            if (result.status === 'Timeout') {
                const filePath = path.relative(sourceRoot, result.fileName);
                const { line, column } = result.location.start;
                reportTimeout(
                    `Mutation timed out: ${filePath}:${line}:${column} (${result.id}, ${result.mutatorName})`
                );
            }
        }
    };
}
