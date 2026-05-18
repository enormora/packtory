/* eslint-disable max-statements, complexity, sonarjs/no-nested-template-literals, unicorn/prefer-single-call -- terminal rendering is intentionally linear and string-heavy */
import { collectChangedArtifacts } from '../preview/changed-artifacts.ts';
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
    lines.push(
        ...pkg.tree.map((node) => {
            return renderArtifactNode(node, colors);
        })
    );
    if (pkg.eliminatedSourceFiles.length > 0) {
        lines.push(`  ${colors.bold('Eliminated source files')}`);
        lines.push(
            ...pkg.eliminatedSourceFiles.map((file) => {
                return `    - ${file.path} ${colors.dim(`(${formatTerminalBytes(file.sourceBytes)})`)}`;
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
