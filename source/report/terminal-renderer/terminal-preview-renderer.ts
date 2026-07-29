import type { PreviewDocument } from '../preview/preview-document.ts';
import { renderPackage } from './terminal-package-renderer.ts';
import { createColors, renderFailureDocumentHeader, type Colors } from './terminal-preview-renderer-shared.ts';

type TerminalPreviewRendererOptions = {
    readonly color?: boolean | undefined;
};

function renderSummary(document: PreviewDocument): string {
    return [
        `${document.summary.totalPackages} package(s)`,
        `${document.summary.changedPackages} changed`,
        `${document.summary.failedPackages} failed`
    ]
        .join(' · ');
}

function renderIssues(issues: readonly string[], colors: Colors): string | undefined {
    if (issues.length === 0) {
        return undefined;
    }

    const issueLines = issues.map(function (issue) {
        return `- ${issue}`;
    });
    return [ colors.red('Issues'), ...issueLines ].join('\n');
}

function renderTitle(document: PreviewDocument, colors: Colors): string {
    const modeLabel = colors.yellow(`[${document.modeLabel}]`);
    return `${colors.bold(document.title)} ${modeLabel}`;
}

export function renderTerminalPreview(document: PreviewDocument, options: TerminalPreviewRendererOptions = {}): string {
    const colors = createColors(options.color);
    const sections = [
        renderTitle(document, colors),
        colors.dim(renderSummary(document)),
        renderIssues(document.issues, colors),
        ...document.packages.map(function (pkg) {
            return renderPackage(pkg, colors);
        })
    ]
        .filter(function (section): section is string {
            return section !== undefined;
        });
    return `${sections.join('\n\n')}\n`;
}

export function renderFailureOnlyTerminalPreview(
    document: PreviewDocument,
    options: TerminalPreviewRendererOptions = {}
): string {
    const colors = createColors(options.color);
    const failedPackageLines = document.packages.flatMap(function (pkg): readonly string[] {
        if (pkg.failure === undefined) {
            return [];
        }
        return [ `${colors.bold(pkg.name)} ${pkg.failure.stage}: ${pkg.failure.message}` ];
    });
    const lines = [
        ...renderFailureDocumentHeader(document, colors),
        ...failedPackageLines
    ];
    return `${lines.join('\n')}\n`;
}
