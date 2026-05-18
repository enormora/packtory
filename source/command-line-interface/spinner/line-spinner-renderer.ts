import { bold, green, red } from 'yoctocolors';
import type { TerminalSpinnerRenderer } from './terminal-spinner-renderer.ts';

type Status = 'failure' | 'success';

export type LineSpinnerRendererDependencies = {
    readonly log: (message: string) => void;
};

function getErrorSymbol(): string {
    return bold(red('✖'));
}

function getSuccessSymbol(): string {
    return bold(green('✔'));
}

function renderProgressLine(label: string, message: string): string {
    return `${label}: ${message}`;
}

function renderStopLine(status: Status, label: string, message: string): string {
    const symbol = status === 'success' ? getSuccessSymbol() : getErrorSymbol();
    return `${symbol} ${renderProgressLine(label, message)}`;
}

export function createLineSpinnerRenderer(dependencies: LineSpinnerRendererDependencies): TerminalSpinnerRenderer {
    const { log } = dependencies;
    const labelsById = new Map<string, string>();

    function getLabel(id: string): string {
        const label = labelsById.get(id);
        if (label !== undefined) {
            return label;
        }
        throw new Error(`Spinner with id ${id} does not exist`);
    }

    return {
        add(id, label, message) {
            if (labelsById.has(id)) {
                throw new Error(`Spinner with id ${id} already exists`);
            }
            labelsById.set(id, label);
            log(renderProgressLine(label, message));
        },

        updateMessage(id, message) {
            log(renderProgressLine(getLabel(id), message));
        },

        stop(id, status, message) {
            log(renderStopLine(status, getLabel(id), message));
        },

        stopAll() {
            labelsById.clear();
        }
    };
}
