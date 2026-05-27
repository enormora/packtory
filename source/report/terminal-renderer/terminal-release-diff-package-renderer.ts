/* eslint-disable sonarjs/no-nested-template-literals, @stylistic/max-len -- terminal rendering is intentionally linear and string-heavy */
import { buildPathTree, pathTreeNodeType, type PathTreeFileNode, type PathTreeNode } from '../../common/path-tree.ts';
import {
    modifiedFileContentChangeKind,
    packageReleaseDiffState,
    type AddedFile,
    type FileSetDiff,
    type ModifiedFile,
    type PackageReleaseDiff,
    type RemovedFile
} from '../release-diff/file-set-diff.ts';
import { formatTerminalBytes } from './terminal-artifact-renderer.ts';
import { renderDiffLine, type Colors } from './terminal-preview-renderer-shared.ts';

type AnyFile = AddedFile | ModifiedFile | RemovedFile;
type TextHighlighter = (text: string) => string;
type TreeGroupRenderer<T extends AnyFile> = {
    readonly appendFileLines: (lines: string[], node: PathTreeFileNode<T>, colors: Colors) => void;
    readonly files: readonly T[];
    readonly title: string;
};

const fileMarker = { added: '+', modified: '~', removed: '-' } as const;
const modifiedAnnotationLabel = {
    [modifiedFileContentChangeKind.binary]: ' (binary, no text diff)',
    [modifiedFileContentChangeKind.modeOnly]: ' (mode only)',
    [modifiedFileContentChangeKind.text]: ''
} as const;
const hunkIndentDepthIncrement = 2;

function indent(depth: number): string {
    return `  ${'  '.repeat(depth)}`;
}

function renderDirectoryLine(
    node: Extract<PathTreeNode<AnyFile>, { type: typeof pathTreeNodeType.directory }>,
    colors: Colors
): string {
    return `${indent(node.depth)}${colors.bold(`▸ ${node.name}/`)}`;
}

function sizeLabel(sizeBytes: number, colors: Colors): string {
    return colors.dim(`(${formatTerminalBytes(sizeBytes)})`);
}

function renderSizedFileRow<T extends AddedFile | RemovedFile>(
    node: PathTreeFileNode<T>,
    marker: string,
    highlight: TextHighlighter,
    colors: Colors
): string {
    return `${indent(node.depth)}${highlight(marker)} ${node.name} ${sizeLabel(node.item.sizeBytes, colors)}`;
}

function unixModeFor(isExecutable: boolean): string {
    return isExecutable ? '755' : '644';
}

function renderModeChangeSuffix(file: ModifiedFile, colors: Colors): string {
    if (file.oldIsExecutable === file.newIsExecutable) {
        return '';
    }

    return colors.yellow(` mode ${unixModeFor(file.oldIsExecutable)} -> ${unixModeFor(file.newIsExecutable)}`);
}

function renderModifiedAnnotation(file: ModifiedFile, colors: Colors): string {
    const annotation = modifiedAnnotationLabel[file.contentChange.kind];
    return colors.dim(annotation);
}

function renderModifiedHeading(node: PathTreeFileNode<ModifiedFile>, colors: Colors): string {
    const file = node.item;
    const sizeDelta = `${formatTerminalBytes(file.oldSizeBytes)} -> ${formatTerminalBytes(file.newSizeBytes)}`;
    return `${indent(node.depth)}${colors.yellow(fileMarker.modified)} ${node.name} ${colors.dim(`(${sizeDelta})`)}${renderModeChangeSuffix(file, colors)}${renderModifiedAnnotation(file, colors)}`;
}

function hasRenderedHunks(
    contentChange: ModifiedFile['contentChange']
): contentChange is Extract<ModifiedFile['contentChange'], { readonly hunks: readonly unknown[] }> {
    return 'hunks' in contentChange;
}

function appendTextDiffHunks(
    lines: string[],
    hunks: Extract<ModifiedFile['contentChange'], { readonly hunks: readonly unknown[] }>['hunks'],
    hunkIndent: string,
    colors: Colors
): void {
    for (const hunk of hunks) {
        lines.push(`${hunkIndent}${colors.dim(hunk.header)}`);
        for (const line of hunk.lines) {
            lines.push(`${hunkIndent}${renderDiffLine(line, colors)}`);
        }
    }
}

function appendAddedFileLines(lines: string[], node: PathTreeFileNode<AddedFile>, colors: Colors): void {
    lines.push(renderSizedFileRow(node, fileMarker.added, colors.green, colors));
}

function appendRemovedFileLines(lines: string[], node: PathTreeFileNode<RemovedFile>, colors: Colors): void {
    lines.push(renderSizedFileRow(node, fileMarker.removed, colors.red, colors));
}

function appendModifiedHunks(lines: string[], node: PathTreeFileNode<ModifiedFile>, colors: Colors): void {
    if (!hasRenderedHunks(node.item.contentChange)) {
        return;
    }

    appendTextDiffHunks(lines, node.item.contentChange.hunks, indent(node.depth + hunkIndentDepthIncrement), colors);
}

function appendModifiedFileLines(lines: string[], node: PathTreeFileNode<ModifiedFile>, colors: Colors): void {
    lines.push(renderModifiedHeading(node, colors));
    appendModifiedHunks(lines, node, colors);
}

function appendTreeGroup<T extends AnyFile>(lines: string[], group: TreeGroupRenderer<T>, colors: Colors): void {
    if (group.files.length === 0) {
        return;
    }

    lines.push(`  ${colors.bold(`${group.title} (${group.files.length})`)}`);
    const tree = buildPathTree(group.files, (file) => {
        return file.path;
    });
    for (const node of tree) {
        if (node.type === pathTreeNodeType.directory) {
            lines.push(renderDirectoryLine(node, colors));
        } else {
            group.appendFileLines(lines, node, colors);
        }
    }
}

function renderHeaderSummary(files: FileSetDiff, unchangedCount: number): string {
    const parts = [
        `${files.added.length} added`,
        `${files.removed.length} removed`,
        `${files.modified.length} modified`,
        `${unchangedCount} unchanged`
    ];
    return parts.join(', ');
}

function renderUnchangedPackage(pkg: PackageReleaseDiff, colors: Colors): string {
    return colors.dim(`${colors.bold(pkg.name)}  ${pkg.previousVersionLabel}  ·  no changes`);
}

function appendFirstPublishPackageLines(lines: string[], pkg: PackageReleaseDiff, colors: Colors): void {
    lines.push(
        `${colors.bold(pkg.name)}  ${colors.dim(pkg.versionTransition)}`,
        `  ${colors.yellow('[first publish]')}  ${colors.dim('showing all bundled files as added')}`
    );
    appendTreeGroup(lines, { title: 'Added', files: pkg.files.added, appendFileLines: appendAddedFileLines }, colors);
}

function appendChangedPackageLines(lines: string[], pkg: PackageReleaseDiff, colors: Colors): void {
    const summary = renderHeaderSummary(pkg.files, pkg.files.unchanged.length);
    lines.push(`${colors.bold(pkg.name)}  ${colors.dim(pkg.versionTransition)}  ${colors.dim(`·  ${summary}`)}`);
    appendTreeGroup(lines, { title: 'Added', files: pkg.files.added, appendFileLines: appendAddedFileLines }, colors);
    appendTreeGroup(
        lines,
        { title: 'Removed', files: pkg.files.removed, appendFileLines: appendRemovedFileLines },
        colors
    );
    appendTreeGroup(
        lines,
        { title: 'Modified', files: pkg.files.modified, appendFileLines: appendModifiedFileLines },
        colors
    );
}

function renderPackageLines(pkg: PackageReleaseDiff, colors: Colors): readonly string[] {
    const lines: string[] = [];

    if (pkg.state === packageReleaseDiffState.unchanged) {
        lines.push(renderUnchangedPackage(pkg, colors));
        return lines;
    }

    if (pkg.state === packageReleaseDiffState.firstPublish) {
        appendFirstPublishPackageLines(lines, pkg, colors);
        return lines;
    }

    appendChangedPackageLines(lines, pkg, colors);
    return lines;
}

export function renderReleaseDiffPackage(pkg: PackageReleaseDiff, colors: Colors): string {
    return renderPackageLines(pkg, colors).join('\n');
}
