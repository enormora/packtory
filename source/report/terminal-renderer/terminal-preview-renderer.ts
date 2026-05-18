/* eslint-disable max-statements, sonarjs/no-nested-template-literals, no-continue, @stylistic/max-len -- terminal rendering is intentionally linear and string-heavy */
import type { PreviewDocument } from '../preview/preview-document.ts';
import { renderPackage } from './terminal-package-renderer.ts';
import { createColors } from './terminal-preview-renderer-shared.ts';

type TerminalPreviewRendererOptions = {
    readonly color?: boolean | undefined;
};

export function renderTerminalPreview(document: PreviewDocument, options: TerminalPreviewRendererOptions = {}): string {
    const colors = createColors(options.color);
    const summary = `${document.summary.totalPackages} package(s) · ${document.summary.changedPackages} changed · ${document.summary.failedPackages} failed`;
    const sections = [
        `${colors.bold(document.title)} ${colors.yellow(`[${document.modeLabel}]`)}`,
        colors.dim(summary)
    ];
    if (document.issues.length > 0) {
        sections.push(
            `${colors.red('Issues')}\n${document.issues
                .map((issue) => {
                    return `- ${issue}`;
                })
                .join('\n')}`
        );
    }
    sections.push(
        ...document.packages.map((pkg) => {
            return renderPackage(pkg, colors);
        })
    );
    return `${sections.join('\n\n')}\n`;
}

export function renderFailureOnlyTerminalPreview(
    document: PreviewDocument,
    options: TerminalPreviewRendererOptions = {}
): string {
    const colors = createColors(options.color);
    const lines = [`${colors.bold(document.title)} ${colors.yellow(`[${document.modeLabel}]`)}`];
    const headings = {
        config: 'Configuration issues',
        checks: 'Check failures',
        partial: 'Package failures'
    } as const;
    if (document.resultType !== 'success') {
        lines.push(colors.red(headings[document.resultType]));
    }
    lines.push(
        ...document.issues.map((issue) => {
            return `- ${issue}`;
        })
    );
    for (const pkg of document.packages) {
        if (pkg.failure === undefined) {
            continue;
        }
        lines.push(`${colors.bold(pkg.name)} ${pkg.failure.stage}: ${pkg.failure.message}`);
    }
    return `${lines.join('\n')}\n`;
}
