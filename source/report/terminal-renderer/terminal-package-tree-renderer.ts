import type { PackageTree } from '../../packtory/packtory-results.ts';
import { buildArtifactTree } from '../preview/artifact-tree-builder.ts';
import { renderArtifactNode } from './terminal-artifact-renderer.ts';
import { createColors, type Colors } from './terminal-preview-renderer-shared.ts';

type TerminalPackageTreeRendererOptions = {
    readonly color?: boolean | undefined;
};

function renderTreeLines(packageTree: PackageTree, colors: Colors): readonly string[] {
    return buildArtifactTree(packageTree.entries).map(function (node) {
        return renderArtifactNode(node, colors);
    });
}

export function renderTerminalPackageTree(
    packageTree: PackageTree,
    options: TerminalPackageTreeRendererOptions = {}
): string {
    const colors = createColors(options.color);
    const lines = [
        colors.bold(packageTree.packageName),
        ...renderTreeLines(packageTree, colors)
    ];
    return `${lines.join('\n')}\n`;
}
