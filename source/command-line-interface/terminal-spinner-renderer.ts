type Status = 'failure' | 'success';

export type TerminalSpinnerRenderer = {
    add: (id: string, label: string, message: string) => void;
    updateMessage: (id: string, message: string) => void;
    stop: (id: string, status: Status, message: string) => void;
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
    message: string;
    status: Status | 'running';
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

    function getSpinnerById(id: string): SpinnerSlot {
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

            const slotIndex = nextFreeSlotIndex();
            usedSlots.add(slotIndex);
            spinners.set(id, { slotIndex, label, message, status: 'running' });
            backend.add(slotIndex, label, message);
        },

        updateMessage(id, message) {
            const spinner = getSpinnerById(id);
            spinner.message = message;
            backend.update(spinner.slotIndex, spinner.label, message);
        },

        stop(id, status, message) {
            const spinner = getSpinnerById(id);
            spinner.message = message;
            spinner.status = status;
            const finalState = status === 'success' ? 'succeeded' : 'failed';
            backend.finish(spinner.slotIndex, finalState, spinner.label, message);
        },

        stopAll() {
            for (const spinner of spinners.values()) {
                if (spinner.status === 'running') {
                    spinner.message = cancelMessage;
                    backend.finish(spinner.slotIndex, 'canceled', spinner.label, cancelMessage);
                }
            }
            spinners.clear();
            backend.shutdown();
        }
    };
}
