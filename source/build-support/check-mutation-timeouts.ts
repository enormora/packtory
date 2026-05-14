import { readFile } from 'node:fs/promises';

const defaultReportPath = 'target/stryker/mutation-report.json';
const reportPathArgIndex = 2;

type MutationLocation = {
    readonly start: {
        readonly line: number;
        readonly column: number;
    };
};

type MutationReportFile = {
    readonly mutants?: readonly {
        readonly status: string;
        readonly location: MutationLocation;
    }[];
};

type ParsedMutant = NonNullable<MutationReportFile['mutants']>[number];

type MutationReport = {
    readonly files?: Readonly<Record<string, MutationReportFile | undefined>>;
};

export type TimeoutMutant = {
    readonly filePath: string;
    readonly line: number;
    readonly column: number;
};

export type ErrorWriter = (message: string) => void;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return Object.prototype.toString.call(value) === '[object Object]';
}

function parseMutationLocation(value: unknown): MutationLocation | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const { start } = value;
    if (!isRecord(start) || typeof start.line !== 'number' || typeof start.column !== 'number') {
        return undefined;
    }

    return {
        start: {
            line: start.line,
            column: start.column
        }
    };
}

function parseMutant(value: unknown): ParsedMutant | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const location = parseMutationLocation(value.location);
    if (location === undefined) {
        return undefined;
    }

    if (typeof value.status !== 'string') {
        throw new TypeError('Mutation report contains a mutant without a string status');
    }

    return { status: value.status, location };
}

function isDefined<T>(value: T | undefined): value is T {
    return value !== undefined;
}

function isErrorWithCode(error: unknown, code: string): error is Error & { readonly code: string } {
    return error instanceof Error && Reflect.get(error, 'code') === code;
}

function parseMutationReportFile(value: unknown): MutationReportFile | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const { mutants } = value;
    if (!Array.isArray(mutants)) {
        return {};
    }

    return {
        mutants: mutants.map(parseMutant).filter(isDefined)
    };
}

function parseMutationReport(value: unknown): MutationReport {
    if (!isRecord(value) || !isRecord(value.files)) {
        return {};
    }

    return {
        files: Object.fromEntries(
            Object.entries(value.files).map(([filePath, fileReport]) => {
                return [filePath, parseMutationReportFile(fileReport)];
            })
        )
    };
}

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
    return Object.entries(report.files ?? {}).flatMap(([filePath, fileReport]) => {
        return collectTimeoutMutantsForFile(filePath, fileReport);
    });
}

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

async function readMutationReport(reportPath: string): Promise<MutationReport> {
    try {
        return parseMutationReport(JSON.parse(await readFile(reportPath, 'utf8')) as unknown);
    } catch (error) {
        if (isErrorWithCode(error, 'ENOENT')) {
            throw new Error(`Mutation report not found at "${reportPath}"`, { cause: error });
        }

        throw error;
    }
}

export async function checkMutationTimeoutReport(reportPath: string): Promise<string | undefined> {
    const report = await readMutationReport(reportPath);
    return formatMutationTimeoutError(collectTimeoutMutants(report));
}

export async function runMutationTimeoutCheck(
    argv: readonly string[],
    writeError: ErrorWriter = (message) => {
        process.stderr.write(`${message}\n`);
    }
): Promise<number> {
    try {
        const reportPath = argv[reportPathArgIndex] ?? defaultReportPath;
        const failureMessage = await checkMutationTimeoutReport(reportPath);

        if (failureMessage !== undefined) {
            writeError(failureMessage);
            return 1;
        }

        return 0;
    } catch (error) {
        writeError(error instanceof Error ? error.message : String(error));
        return 1;
    }
}
