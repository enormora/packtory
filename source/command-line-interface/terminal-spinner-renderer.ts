import type { Spinner } from '@topcli/spinner';

type Status = 'failure' | 'success';

export type TerminalSpinnerRenderer = {
    add(id: string, label: string, message: string): void;
    updateMessage(id: string, message: string): void;
    stop(id: string, status: Status, message: string): void;
    stopAll(): void;
};

export type TerminalSpinnerRendererDependencies = {
    readonly SpinnerClass: typeof Spinner;
};

export function createTerminalSpinnerRenderer(
    dependencies: TerminalSpinnerRendererDependencies
): TerminalSpinnerRenderer {
    const { SpinnerClass } = dependencies;
    const spinners = new Map<string, Spinner>();

    function getSpinnerById(id: string): Spinner {
        const spinner = spinners.get(id);
        if (spinner === undefined) {
            throw new Error(`Spinner with id ${id} does not exist`);
        }
        return spinner;
    }

    function ensureIdDoesNotExist(id: string): void {
        if (spinners.has(id)) {
            throw new Error(`Spinner with id ${id} already exists`);
        }
    }

    return {
        add(id, label, message) {
            ensureIdDoesNotExist(id);

            const spinner = new SpinnerClass({ name: 'dots' });
            spinners.set(id, spinner);
            spinner.start(message, { withPrefix: `${label}: ` });
        },

        updateMessage(id, message) {
            const spinner = getSpinnerById(id);
            spinner.text = message;
        },

        stop(id, status, message) {
            const spinner = getSpinnerById(id);

            if (status === 'failure') {
                spinner.failed(message);
            } else {
                spinner.succeed(message);
            }
        },

        stopAll() {
            SpinnerClass.reset();
        }
    };
}
