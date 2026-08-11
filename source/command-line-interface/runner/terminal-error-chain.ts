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
type CauseLineFormatter = (cause: MessageCarrier, depth: number) => readonly string[];
type StackCarrier = MessageCarrier & {
    readonly stack: string;
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

function hasStack(value: unknown): value is StackCarrier {
    return hasMessage(value) && typeof Reflect.get(value, 'stack') === 'string';
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

function formatStackLines(stack: string, depth: number): readonly string[] {
    const stackIndent = indent.repeat(depth);
    return formatMessageLines(`${stackIndent}Stack trace: `, stack, `${stackIndent}${indent}`);
}

function formatCauseStackLines(cause: StackCarrier, depth: number): readonly string[] {
    const causeIndent = indent.repeat(depth);
    return formatMessageLines(`${causeIndent}Caused by stack trace: `, cause.stack, `${causeIndent}${indent}`);
}

function advanceCauseFormatting(
    state: CauseFormattingState,
    formatCause: CauseLineFormatter
): CauseFormattingState {
    const { cause, visitedCauses } = state;
    if (!hasMessage(cause) || visitedCauses.has(cause)) {
        return state;
    }

    return {
        cause: readCause(cause),
        depth: state.depth + 1,
        lines: [ ...state.lines, ...formatCause(cause, state.depth) ],
        visitedCauses: new Set<unknown>([ ...visitedCauses, cause ])
    };
}

function collectCauseLines(error: MessageCarrier, formatCause: CauseLineFormatter): readonly string[] {
    const initialState: CauseFormattingState = {
        cause: readCause(error),
        depth: 1,
        lines: [],
        visitedCauses: new Set<unknown>([ error ])
    };
    return Array
        .from({ length: maximumCauseDepth })
        .reduce<CauseFormattingState>(function (state) {
            return advanceCauseFormatting(state, formatCause);
        }, initialState)
        .lines;
}

function formatCauseLines(error: MessageCarrier): readonly string[] {
    return collectCauseLines(error, formatCauseMessageLines);
}

function formatErrorChain(error: Error, firstLinePrefix: string): string {
    return [
        ...formatMessageLines(firstLinePrefix, error.message, indent),
        ...formatCauseLines(error)
    ]
        .join('\n');
}

function formatCauseTraceLines(cause: MessageCarrier, depth: number): readonly string[] {
    return hasStack(cause) ? formatCauseStackLines(cause, depth) : [];
}

function formatTraceLines(error: Error): readonly string[] {
    const errorStackLines = hasStack(error) ? formatStackLines(error.stack, 1) : [];
    return [
        ...errorStackLines,
        ...collectCauseLines(error, formatCauseTraceLines)
    ];
}

function formatErrorTrace(error: Error, firstLinePrefix: string): string {
    return [
        formatErrorChain(error, firstLinePrefix),
        ...formatTraceLines(error)
    ]
        .join('\n');
}

export function formatTerminalError(error: Error): string {
    return formatErrorChain(error, '');
}

export function formatTerminalErrorTrace(error: Error): string {
    return formatErrorTrace(error, '');
}

export function formatTerminalErrorBullet(error: Error): string {
    return formatErrorChain(error, '- ');
}

export function formatTerminalErrorTraceBullet(error: Error): string {
    return formatErrorTrace(error, '- ');
}
