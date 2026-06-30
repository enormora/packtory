import { bold, dim, green, red, yellow } from 'yoctocolors';
import { previewResultType } from '../../packtory/packtory-results.ts';
import { previewDiffLineType, type PreviewDiffLine } from '../preview/preview-document-diff.ts';

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
    return function (value) {
        return `\u{1B}[${openCode}m${value}\u{1B}[${closeCode}m`;
    };
}

function createDisabledColors(): Colors {
    return { bold: identity, dim: identity, green: identity, red: identity, yellow: identity };
}

export function createColors(enabled: boolean | undefined): Colors {
    if (enabled === true) {
        return {
            bold: withAnsi(ansi.bold.open, ansi.bold.close),
            dim: withAnsi(ansi.dim.open, ansi.dim.close),
            green: withAnsi(ansi.green.open, ansi.green.close),
            red: withAnsi(ansi.red.open, ansi.red.close),
            yellow: withAnsi(ansi.yellow.open, ansi.yellow.close)
        };
    }
    if (enabled === undefined) {
        return { bold, dim, green, red, yellow };
    }
    return createDisabledColors();
}

export function renderDiffLine(line: PreviewDiffLine, colors: Colors): string {
    if (line.type === previewDiffLineType.add) {
        return colors.green(line.text);
    }
    if (line.type === previewDiffLineType.remove) {
        return colors.red(line.text);
    }
    return line.text;
}

export type FailureDocumentHeader = {
    readonly title: string;
    readonly modeLabel: string;
    readonly resultType: (typeof previewResultType)[keyof typeof previewResultType];
    readonly issues: readonly string[];
};

const resultTypeHeadings = {
    [previewResultType.config]: 'Configuration issues',
    [previewResultType.checks]: 'Check failures',
    [previewResultType.partial]: 'Package failures'
} as const;

export function renderFailureDocumentHeader(document: FailureDocumentHeader, colors: Colors): readonly string[] {
    const chip = `[${document.modeLabel}]`;
    const lines = [ `${colors.bold(document.title)} ${colors.yellow(chip)}` ];
    if (document.resultType !== previewResultType.success) {
        lines.push(colors.red(resultTypeHeadings[document.resultType]));
    }
    lines.push(
        ...document.issues.map(function (issue) {
            return `- ${issue}`;
        })
    );
    return lines;
}
