import type { runSafely } from 'cmd-ts';

type CommandParseResult = Awaited<ReturnType<typeof runSafely>>;

type CommandParseError = {
    readonly error: {
        readonly config: {
            readonly message: string;
            readonly exitCode: number;
        };
    };
};

function hasCommandParseError(result: CommandParseResult): result is CommandParseError & CommandParseResult {
    return Object.hasOwn(result, 'error');
}

export function getParseExitCode(log: (message: string) => void, result: CommandParseResult): number | undefined {
    if (!hasCommandParseError(result)) {
        return undefined;
    }
    log(result.error.config.message);
    return result.error.config.exitCode;
}

export type PreparedProgramArguments = {
    readonly arguments: readonly string[];
    readonly rootHelp: boolean;
    readonly trace: boolean;
};

const traceFlag = '--trace';
const traceHelpText = '  --trace  print stack traces for errors';
const commandArgumentOffset = 2;
const firstCommandArgumentIndex = 2;
const firstArgumentAfterTraceIndex = 3;

function isRootHelpRequest(programArguments: readonly string[]): boolean {
    const commandArguments = programArguments.slice(commandArgumentOffset);
    return commandArguments.length === 0 || commandArguments[0] === '--help' || commandArguments[0] === '-h';
}

export function prepareProgramArguments(programArguments: readonly string[]): PreparedProgramArguments {
    const trace = programArguments[firstCommandArgumentIndex] === traceFlag;
    const preparedArguments = trace
        ? [
            ...programArguments.slice(0, commandArgumentOffset),
            ...programArguments.slice(firstArgumentAfterTraceIndex)
        ]
        : Array.from(programArguments);
    return {
        arguments: preparedArguments,
        rootHelp: isRootHelpRequest(preparedArguments),
        trace
    };
}

function addTraceHelp(message: string): string {
    return `${message}\n${traceHelpText}`;
}

export function createParseLogger(log: (message: string) => void, rootHelp: boolean): (message: string) => void {
    return function logParseMessage(message) {
        log(rootHelp ? addTraceHelp(message) : message);
    };
}
