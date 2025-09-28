import type { Spinner } from '@topcli/spinner';

type Status = 'failure' | 'success';

export type TerminalSpinnerRenderer = {
    add: (id: string, label: string, message: string) => void;
    updateMessage: (id: string, message: string) => void;
    stop: (id: string, status: Status, message: string) => void;
    stopAll: () => void;
};

export type TerminalSpinnerRendererDependencies = {
    readonly SpinnerClass: typeof Spinner;
};

type StatefulSpinner = {
    readonly isRunning: boolean;
    readonly instance: Spinner;
};

export function createTerminalSpinnerRenderer(
    dependencies: TerminalSpinnerRendererDependencies
): TerminalSpinnerRenderer {
    const { SpinnerClass } = dependencies;
    const spinners = new Map<string, StatefulSpinner>();

    function getSpinnerById(id: string): StatefulSpinner {
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
            spinners.set(id, { instance: spinner, isRunning: true });
            spinner.start(message, { withPrefix: `${label}: ` });
        },

        updateMessage(id, message) {
            const spinner = getSpinnerById(id);
            spinner.instance.text = message;
        },

        stop(id, status, message) {
            const spinner = getSpinnerById(id);

            spinners.set(id, { instance: spinner.instance, isRunning: false });

            if (status === 'failure') {
                spinner.instance.failed(message);
            } else {
                spinner.instance.succeed(message);
            }
        },

        stopAll() {
            for (const spinner of spinners.values()) {
                if (spinner.isRunning) {
                    spinner.instance.failed('Canceled …');
                }
            }
            SpinnerClass.reset();
        }
    };
}
