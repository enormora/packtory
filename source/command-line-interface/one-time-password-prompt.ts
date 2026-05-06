import type { Clock } from '../common/clock.ts';

type OneTimePasswordReadline = {
    question: (prompt: string) => Promise<string>;
    close: () => void;
};

export type OneTimePasswordPromptDependencies = {
    readonly clock: Clock;
    readonly isInteractiveTerminal: () => boolean;
    readonly stopSpinner: () => void;
    readonly createInterface: () => OneTimePasswordReadline;
};

export type OneTimePasswordPrompt = () => Promise<string | undefined>;

const oneTimePasswordPromptTimeoutMs = 90_000;

export function createOneTimePasswordPrompt(
    dependencies: Readonly<OneTimePasswordPromptDependencies>
): OneTimePasswordPrompt {
    const { clock, isInteractiveTerminal, stopSpinner, createInterface } = dependencies;

    return async () => {
        if (!isInteractiveTerminal()) {
            throw new Error(
                'The registry requested a one-time password, but prompting requires an interactive terminal'
            );
        }

        stopSpinner();
        const interfaceInstance = createInterface();

        try {
            const answer = await Promise.race([
                interfaceInstance.question('Registry one-time password: '),
                new Promise<undefined>((resolve) => {
                    clock.setTimeout(() => {
                        resolve(undefined);
                    }, oneTimePasswordPromptTimeoutMs);
                })
            ]);

            if (typeof answer !== 'string' || answer.trim().length === 0) {
                throw new Error('One-time password input timed out or was empty');
            }

            return answer.trim();
        } finally {
            interfaceInstance.close();
        }
    };
}
