import type { ReleaseDiffDocument } from '../release-diff/release-diff-document.ts';
import { renderReleaseDiffPackage } from './terminal-release-diff-package-renderer.ts';
import { createColors, renderFailureDocumentHeader, type Colors } from './terminal-preview-renderer-shared.ts';

type TerminalReleaseDiffRendererOptions = {
    readonly color?: boolean | undefined;
};

function renderDocumentSummary(document: ReleaseDiffDocument, colors: Colors): string {
    const packageLine = [
        `${document.summary.totalPackages} package(s)`,
        `${document.summary.changedPackages} changed`,
        `${document.summary.firstPublishPackages} first-publish`,
        `${document.summary.unchangedPackages} unchanged`,
        `${document.summary.failedPackages} failed`
    ].join(' · ');
    const fileLine = [
        `${document.summary.addedFiles} files added`,
        `${document.summary.removedFiles} removed`,
        `${document.summary.modifiedFiles} modified`
    ].join(' · ');
    const indentedFileLine = `            · ${fileLine}`;
    return `${colors.dim(packageLine)}\n${colors.dim(indentedFileLine)}`;
}

function renderDocumentHeader(document: ReleaseDiffDocument, colors: Colors): string {
    const chip = `[${document.modeLabel}]`;
    return `${colors.bold(document.title)}  ${colors.yellow(chip)}`;
}

function renderIssuesSection(document: ReleaseDiffDocument, colors: Colors): readonly string[] {
    if (document.issues.length === 0) {
        return [];
    }
    return [
        `${colors.red('Issues')}\n${document.issues
            .map((issue) => {
                return `- ${issue}`;
            })
            .join('\n')}`
    ];
}

export function renderTerminalReleaseDiff(
    document: ReleaseDiffDocument,
    options: TerminalReleaseDiffRendererOptions = {}
): string {
    const colors = createColors(options.color);
    const packageSections = document.packages.map((pkg) => {
        return renderReleaseDiffPackage(pkg, colors);
    });
    const sections = [
        renderDocumentHeader(document, colors),
        renderDocumentSummary(document, colors),
        ...renderIssuesSection(document, colors),
        ...packageSections
    ];
    return `${sections.join('\n\n')}\n`;
}

export function renderFailureOnlyTerminalReleaseDiff(
    document: ReleaseDiffDocument,
    options: TerminalReleaseDiffRendererOptions = {}
): string {
    const colors = createColors(options.color);
    const lines = Array.from(renderFailureDocumentHeader(document, colors));
    return `${lines.join('\n')}\n`;
}
