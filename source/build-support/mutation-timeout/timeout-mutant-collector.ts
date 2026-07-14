import type { MutationReport, MutationReportFile } from './mutation-report-schema.ts';

export type TimeoutMutant = {
    readonly filePath: string;
    readonly line: number;
    readonly column: number;
};

function collectTimeoutMutantsForFile(
    filePath: string,
    fileReport: MutationReportFile | undefined
): readonly TimeoutMutant[] {
    if (fileReport?.mutants === undefined) {
        return [];
    }

    const timeoutMutants = fileReport.mutants.filter(function (mutant) {
        return mutant.status === 'Timeout';
    });

    return timeoutMutants.map(function (mutant) {
        const { start } = mutant.location;
        return { filePath, line: start.line, column: start.column };
    });
}

export function collectTimeoutMutants(report: MutationReport): readonly TimeoutMutant[] {
    return Object.entries(report.files ?? {}).flatMap(function ([ filePath, fileReport ]) {
        return collectTimeoutMutantsForFile(filePath, fileReport);
    });
}
