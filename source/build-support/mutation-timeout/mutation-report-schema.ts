import { isArray, isDefined, isPlainObject } from 'remeda';

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

function parseMutationLocation(value: unknown): MutationLocation | undefined {
    if (!isPlainObject(value)) {
        return undefined;
    }

    const { start } = value;
    if (!isPlainObject(start) || typeof start.line !== 'number' || typeof start.column !== 'number') {
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
    if (!isPlainObject(value)) {
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

function parseMutationReportFile(value: unknown): MutationReportFile | undefined {
    if (!isPlainObject(value)) {
        return undefined;
    }

    const { mutants } = value;
    if (!isArray(mutants)) {
        return {};
    }

    return {
        mutants: mutants.map(parseMutant).filter(isDefined)
    };
}

export function parseMutationReport(value: unknown): MutationReport {
    if (!isPlainObject(value) || !isPlainObject(value.files)) {
        return {};
    }

    return {
        files: Object.fromEntries(
            Object.entries(value.files).map(function ([ filePath, fileReport ]) {
                return [ filePath, parseMutationReportFile(fileReport) ];
            })
        )
    };
}
