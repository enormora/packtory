import { bold, dim, green, red, yellow } from 'yoctocolors';
import type { PreviewDiffLine } from './preview-document-helpers.ts';

export type Colors = {
    readonly bold: (value: string) => string;
    readonly dim: (value: string) => string;
    readonly green: (value: string) => string;
    readonly red: (value: string) => string;
    readonly yellow: (value: string) => string;
};

const ansi = {
    bold: { open: 1, close: 22 },
    dim: { open: 2, close: 22 },
    green: { open: 32, close: 39 },
    red: { open: 31, close: 39 },
    yellow: { open: 33, close: 39 }
} as const;

function identity(value: string): string {
    return value;
}

function withAnsi(openCode: number, closeCode: number): (value: string) => string {
    return (value) => {
        return `\u001B[${openCode}m${value}\u001B[${closeCode}m`;
    };
}

export function createColors(enabled: boolean | undefined): Colors {
    if (enabled === false) {
        return { bold: identity, dim: identity, green: identity, red: identity, yellow: identity };
    }
    if (enabled === true) {
        return {
            bold: withAnsi(ansi.bold.open, ansi.bold.close),
            dim: withAnsi(ansi.dim.open, ansi.dim.close),
            green: withAnsi(ansi.green.open, ansi.green.close),
            red: withAnsi(ansi.red.open, ansi.red.close),
            yellow: withAnsi(ansi.yellow.open, ansi.yellow.close)
        };
    }
    return { bold, dim, green, red, yellow };
}

export function renderDiffLine(line: PreviewDiffLine, colors: Colors): string {
    if (line.type === 'add') {
        return colors.green(line.text);
    }
    if (line.type === 'remove') {
        return colors.red(line.text);
    }
    return line.text;
}
