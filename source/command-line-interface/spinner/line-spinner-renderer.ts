import { bold, green, red } from 'yoctocolors';
import { spinnerResultStatus, type TerminalSpinnerRenderer } from './terminal-spinner-renderer.ts';

type Status = (typeof spinnerResultStatus)[keyof typeof spinnerResultStatus];

export type LineSpinnerRendererDependencies = {
    readonly log: (message: string) => void;
};

function getErrorSymbol(): string {
    return bold(red('✖'));
}

function getSuccessSymbol(): string {
    return bold(green('✔'));
}

function getStatusSymbol(status: Status): string {
    if (status === spinnerResultStatus.success) {
        return getSuccessSymbol();
    }
    return getErrorSymbol();
}

function renderProgressLine(label: string, message: string): string {
    return `${label}: ${message}`;
}

function renderStopLine(status: Status, label: string, message: string): string {
    return `${getStatusSymbol(status)} ${renderProgressLine(label, message)}`;
}

export function createLineSpinnerRenderer(dependencies: LineSpinnerRendererDependencies): TerminalSpinnerRenderer {
    const { log } = dependencies;
    const labelsByIdentifier = new Map<string, string>();

    function getLabel(identifier: string): string {
        const label = labelsByIdentifier.get(identifier);
        if (label !== undefined) {
            return label;
        }
        throw new Error(`Spinner with id ${identifier} does not exist`);
    }

    return {
        add(identifier, label, message) {
            if (labelsByIdentifier.has(identifier)) {
                throw new Error(`Spinner with id ${identifier} already exists`);
            }
            labelsByIdentifier.set(identifier, label);
            log(renderProgressLine(label, message));
        },

        updateMessage(identifier, message) {
            log(renderProgressLine(getLabel(identifier), message));
        },

        stop(identifier, status, message) {
            log(renderStopLine(status, getLabel(identifier), message));
        },

        stopAll() {
            labelsByIdentifier.clear();
        }
    };
}
