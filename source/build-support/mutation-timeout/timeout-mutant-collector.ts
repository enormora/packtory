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

    const timeouts: TimeoutMutant[] = [];

    for (const mutant of fileReport.mutants) {
        if (mutant.status === 'Timeout') {
            const { start } = mutant.location;
            timeouts.push({ filePath, line: start.line, column: start.column });
        }
    }

    return timeouts;
}

export function collectTimeoutMutants(report: MutationReport): readonly TimeoutMutant[] {
    return Object.entries(report.files ?? {}).flatMap(function ([ filePath, fileReport ]) {
        return collectTimeoutMutantsForFile(filePath, fileReport);
    });
}
