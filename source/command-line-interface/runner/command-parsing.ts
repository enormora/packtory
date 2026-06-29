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
