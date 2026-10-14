export const spinnerResultStatus = {
    failure: 'failure',
    success: 'success'
} as const;

type Status = (typeof spinnerResultStatus)[keyof typeof spinnerResultStatus];

export type TerminalSpinnerRenderer = {
    add: (identifier: string, label: string, message: string) => void;
    updateMessage: (identifier: string, message: string) => void;
    stop: (identifier: string, status: Status, message: string) => void;
    stopAll: () => void;
};

export type SpinnerBackend = {
    readonly add: (slotIndex: number, label: string, message: string) => void;
    readonly update: (slotIndex: number, label: string, message: string) => void;
    readonly finish: (
        slotIndex: number,
        status: 'canceled' | 'failed' | 'succeeded',
        label: string,
        message: string
    ) => void;
    readonly shutdown: () => void;
};

export type TerminalSpinnerRendererDependencies = {
    readonly backend: SpinnerBackend;
};

type SpinnerSlot = {
    readonly slotIndex: number;
    readonly label: string;
    readonly message: string;
    readonly status: Status | 'running';
};

const cancelMessage = 'Canceled …';

export function createTerminalSpinnerRenderer(
    dependencies: TerminalSpinnerRendererDependencies
): TerminalSpinnerRenderer {
    const { backend } = dependencies;
    const spinners = new Map<string, SpinnerSlot>();
    const usedSlots = new Set<number>();

    function nextFreeSlotIndex(): number {
        return usedSlots.size;
    }

    function getSpinnerByIdentifier(identifier: string): SpinnerSlot {
        const spinner = spinners.get(identifier);
        if (spinner === undefined) {
            throw new Error(`Spinner with id ${identifier} does not exist`);
        }
        return spinner;
    }

    function ensureIdentifierDoesNotExist(identifier: string): void {
        if (spinners.has(identifier)) {
            throw new Error(`Spinner with id ${identifier} already exists`);
        }
    }

    return {
        add(identifier, label, message) {
            ensureIdentifierDoesNotExist(identifier);

            const slotIndex = nextFreeSlotIndex();
            usedSlots.add(slotIndex);
            spinners.set(identifier, { slotIndex, label, message, status: 'running' });
            backend.add(slotIndex, label, message);
        },

        updateMessage(identifier, message) {
            const spinner = getSpinnerByIdentifier(identifier);
            spinners.set(identifier, { ...spinner, message });
            backend.update(spinner.slotIndex, spinner.label, message);
        },

        stop(identifier, status, message) {
            const spinner = getSpinnerByIdentifier(identifier);
            spinners.set(identifier, { ...spinner, message, status });
            const finalState = status === spinnerResultStatus.success ? 'succeeded' : 'failed';
            backend.finish(spinner.slotIndex, finalState, spinner.label, message);
        },

        stopAll() {
            for (const spinner of spinners.values()) {
                if (spinner.status === 'running') {
                    backend.finish(spinner.slotIndex, 'canceled', spinner.label, cancelMessage);
                }
            }
            spinners.clear();
            backend.shutdown();
        }
    };
}
