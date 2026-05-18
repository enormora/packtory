type MutationLocation = {
    readonly start: {
        readonly line: number;
        readonly column: number;
    };
};

export type MutationReportFile = {
    readonly mutants?: readonly {
        readonly status: string;
        readonly location: MutationLocation;
    }[];
};

type ParsedMutant = NonNullable<MutationReportFile['mutants']>[number];

export type MutationReport = {
    readonly files?: Readonly<Record<string, MutationReportFile | undefined>>;
};

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

export function parseMutationReport(value: unknown): MutationReport {
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
