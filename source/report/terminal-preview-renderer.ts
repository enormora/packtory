/* eslint-disable max-statements, complexity, sonarjs/no-nested-template-literals, unicorn/prefer-single-call, functional/prefer-tacit, @stylistic/max-len, no-continue -- terminal rendering is intentionally linear and string-heavy */
import {
    artifactBadgeLabel,
    artifactStatusLabel,
    type PreviewDocument,
    type PreviewPackage
} from './preview-document.ts';
import { collectChangedArtifacts } from './changed-artifacts.ts';
import { createColors, renderDiffLine, type Colors } from './terminal-preview-renderer-shared.ts';
import type { PreviewArtifactNode } from './preview-document-helpers.ts';

type TerminalPreviewRendererOptions = {
    readonly color?: boolean | undefined;
};

function formatBytes(bytes: number): string {
    return `${bytes} B`;
}

function renderArtifactNode(node: PreviewArtifactNode, colors: Colors): string {
    const indent = `  ${'  '.repeat(node.depth)}`;
    if (node.type === 'directory') {
        return `${indent}${colors.bold(`▸ ${node.name}/`)}`;
    }
    const { artifact } = node;
    const badgeParts = [
        artifactStatusLabel(artifact.status),
        ...artifact.badges.map((badge) => {
            return artifactBadgeLabel(badge);
        })
    ];
    return `${indent}• ${artifact.path} ${colors.dim(`(${artifact.kind}, ${formatBytes(artifact.sizeBytes)})`)} ${colors.yellow(
        `[${badgeParts.join(', ')}]`
    )}`.trimEnd();
}

function renderPackage(pkg: PreviewPackage, colors: Colors): string {
    const lines = [
        `${colors.bold(pkg.name)}${pkg.versionTransition === undefined ? '' : ` ${colors.dim(pkg.versionTransition)}`}`
    ];
    if (pkg.failure !== undefined) {
        lines.push(`${colors.red('  failure')} ${pkg.failure.stage}: ${pkg.failure.message}`);
    }
    lines.push(
        ...pkg.tree.map((node) => {
            return renderArtifactNode(node, colors);
        })
    );
    if (pkg.eliminatedSourceFiles.length > 0) {
        lines.push(`  ${colors.bold('Eliminated source files')}`);
        lines.push(
            ...pkg.eliminatedSourceFiles.map((file) => {
                return `    - ${file.path} ${colors.dim(`(${formatBytes(file.sourceBytes)})`)}`;
            })
        );
    }
    const changedFiles = collectChangedArtifacts(pkg.tree);
    if (changedFiles.length > 0) {
        lines.push(`  ${colors.bold('Diffs')}`);
        for (const artifact of changedFiles) {
            lines.push(`    ${artifact.path}`);
            for (const hunk of artifact.diff) {
                lines.push(`      ${colors.dim(hunk.header)}`);
                lines.push(
                    ...hunk.lines.map((line) => {
                        return `      ${renderDiffLine(line, colors)}`;
                    })
                );
            }
        }
    }
    return lines.join('\n');
}

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
