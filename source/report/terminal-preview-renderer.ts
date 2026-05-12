import { bold, dim, green, red, yellow } from 'yoctocolors';
import type { PreviewArtifactNode, PreviewDiffLine, PreviewDocument, PreviewPackage } from './preview-document.ts';
import { artifactBadgeLabel, artifactStatusLabel } from './preview-document.ts';

type TerminalPreviewRendererOptions = {
    readonly color?: boolean | undefined;
};

type Colors = {
    readonly bold: (value: string) => string;
    readonly dim: (value: string) => string;
    readonly green: (value: string) => string;
    readonly red: (value: string) => string;
    readonly yellow: (value: string) => string;
};

function createColors(enabled: boolean): Colors {
    if (!enabled) {
        return {
            bold: (value) => value,
            dim: (value) => value,
            green: (value) => value,
            red: (value) => value,
            yellow: (value) => value
        };
    }
    return { bold, dim, green, red, yellow };
}

function formatBytes(bytes: number): string {
    return `${bytes} B`;
}

function renderArtifactNode(node: PreviewArtifactNode, colors: Colors): string {
    const indent = `  ${'  '.repeat(node.depth)}`;
    if (node.type === 'directory') {
        return `${indent}${colors.bold(`▸ ${node.name}/`)}`;
    }
    const artifact = node.artifact;
    if (artifact === undefined) {
        throw new Error(`Artifact missing for file node "${node.path}"`);
    }
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

function renderDiffLine(line: PreviewDiffLine, colors: Colors): string {
    if (line.type === 'add') {
        return colors.green(line.text);
    }
    if (line.type === 'remove') {
        return colors.red(line.text);
    }
    return line.text;
}

function renderPackage(pkg: PreviewPackage, colors: Colors): string {
    const lines = [
        `${colors.bold(pkg.name)}${pkg.versionTransition === undefined ? '' : ` ${colors.dim(pkg.versionTransition)}`}`
    ];
    if (pkg.failure !== undefined) {
        lines.push(`${colors.red('  failure')} ${pkg.failure.stage}: ${pkg.failure.message}`);
    }
    lines.push(...pkg.tree.map((node) => renderArtifactNode(node, colors)));
    if (pkg.eliminatedSourceFiles.length > 0) {
        lines.push(`  ${colors.bold('Eliminated source files')}`);
        lines.push(
            ...pkg.eliminatedSourceFiles.map((file) => {
                return `    - ${file.path} ${colors.dim(`(${formatBytes(file.sourceBytes)})`)}`;
            })
        );
    }
    const changedFiles = pkg.tree.filter((node) => {
        return node.type === 'file' && node.artifact?.diff !== undefined;
    });
    if (changedFiles.length > 0) {
        lines.push(`  ${colors.bold('Diffs')}`);
        for (const file of changedFiles) {
            const artifact = file.artifact;
            if (artifact === undefined || artifact.diff === undefined) {
                continue;
            }
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
    const colors = createColors(options.color ?? true);
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
    const colors = createColors(options.color ?? true);
    const lines = [`${colors.bold(document.title)} ${colors.yellow(`[${document.modeLabel}]`)}`];
    if (document.resultType === 'config') {
        lines.push(colors.red('Configuration issues'));
    } else if (document.resultType === 'checks') {
        lines.push(colors.red('Check failures'));
    } else if (document.resultType === 'partial') {
        lines.push(colors.red('Package failures'));
    }
    if (document.issues.length > 0) {
        lines.push(
            ...document.issues.map((issue) => {
                return `- ${issue}`;
            })
        );
    }
    for (const pkg of document.packages) {
        if (pkg.failure === undefined) {
            continue;
        }
        lines.push(`${colors.bold(pkg.name)} ${pkg.failure.stage}: ${pkg.failure.message}`);
    }
    return `${lines.join('\n')}\n`;
}
