const indent = '  ';
const maximumCauseDepth = 100;

type MessageCarrier = {
    readonly message: string;
};

type CauseFormattingState = {
    readonly cause: unknown;
    readonly depth: number;
    readonly lines: readonly string[];
    readonly visitedCauses: ReadonlySet<unknown>;
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === 'object' && value !== null;
}

function hasMessage(value: unknown): value is MessageCarrier {
    return (
        isRecord(value) &&
        Object.hasOwn(value, 'message') &&
        typeof Reflect.get(value, 'message') === 'string'
    );
}

function readCause(value: MessageCarrier): unknown {
    return Reflect.get(value, 'cause');
}

function formatMessageLines(
    firstLinePrefix: string,
    message: string,
    continuationIndent: string
): readonly string[] {
    return message.split('\n').map(function (line, index) {
        if (index === 0) {
            return `${firstLinePrefix}${line}`;
        }

        return `${continuationIndent}${line}`;
    });
}

function formatCauseMessageLines(cause: MessageCarrier, depth: number): readonly string[] {
    const causeIndent = indent.repeat(depth);
    return formatMessageLines(`${causeIndent}Caused by: `, cause.message, `${causeIndent}${indent}`);
}

function advanceCauseFormatting(state: CauseFormattingState): CauseFormattingState {
    const { cause, visitedCauses } = state;
    if (!hasMessage(cause) || visitedCauses.has(cause)) {
        return state;
    }

    return {
        cause: readCause(cause),
        depth: state.depth + 1,
        lines: [ ...state.lines, ...formatCauseMessageLines(cause, state.depth) ],
        visitedCauses: new Set<unknown>([ ...visitedCauses, cause ])
    };
}

function formatCauseLines(error: MessageCarrier): readonly string[] {
    const initialState: CauseFormattingState = {
        cause: readCause(error),
        depth: 1,
        lines: [],
        visitedCauses: new Set<unknown>([ error ])
    };
    return Array
        .from({ length: maximumCauseDepth })
        .reduce(advanceCauseFormatting, initialState)
        .lines;
}

function formatErrorChain(error: Error, firstLinePrefix: string): string {
    return [
        ...formatMessageLines(firstLinePrefix, error.message, indent),
        ...formatCauseLines(error)
    ]
        .join('\n');
}

export function formatTerminalErrorBullet(error: Error): string {
    return formatErrorChain(error, '- ');
}
