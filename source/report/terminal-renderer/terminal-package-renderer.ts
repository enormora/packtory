/* eslint-disable max-statements, complexity, sonarjs/no-nested-template-literals -- terminal rendering is intentionally linear and string-heavy */
import type { PreviewPackage } from '../preview/preview-document.ts';
import { formatTerminalBytes, renderArtifactNode } from './terminal-artifact-renderer.ts';
import { renderDiffLine, type Colors } from './terminal-preview-renderer-shared.ts';

export function renderPackage(pkg: PreviewPackage, colors: Colors): string {
    const lines = [
        `${colors.bold(pkg.name)}${pkg.versionTransition === undefined ? '' : ` ${colors.dim(pkg.versionTransition)}`}`
    ];
    if (pkg.failure !== undefined) {
        lines.push(`${colors.red('  failure')} ${pkg.failure.stage}: ${pkg.failure.message}`);
    }
    for (const node of pkg.tree) {
        lines.push(renderArtifactNode(node, colors));
    }
    if (pkg.eliminatedSourceFiles.length > 0) {
        lines.push(`  ${colors.bold('Eliminated source files')}`);
        for (const file of pkg.eliminatedSourceFiles) {
            lines.push(`    - ${file.path} ${colors.dim(`(${formatTerminalBytes(file.sourceBytes)})`)}`);
        }
    }
    if (pkg.changedArtifacts.length > 0) {
        lines.push(`  ${colors.bold('Diffs')}`);
        for (const artifact of pkg.changedArtifacts) {
            lines.push(`    ${artifact.path}`);
            for (const hunk of artifact.diff) {
                lines.push(`      ${colors.dim(hunk.header)}`);
                for (const line of hunk.lines) {
                    lines.push(`      ${renderDiffLine(line, colors)}`);
                }
            }
        }
    }
    return lines.join('\n');
}
