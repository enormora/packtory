/* eslint-disable sonarjs/no-nested-template-literals -- terminal rendering is intentionally linear and string-heavy */
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
    readonly renderFileLines: (node: PathTreeFileNode<T>, colors: Colors) => readonly string[];
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
    node: Extract<PathTreeNode<AnyFile>, { readonly type: typeof pathTreeNodeType.directory; }>,
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
    return `${indent(node.depth)}${colors.yellow(fileMarker.modified)} ${node.name} ${colors.dim(`(${sizeDelta})`)}${
        renderModeChangeSuffix(file, colors)
    }${renderModifiedAnnotation(file, colors)}`;
}

function hasRenderedHunks(
    contentChange: ModifiedFile['contentChange']
): contentChange is Extract<ModifiedFile['contentChange'], { readonly hunks: readonly unknown[]; }> {
    return Object.hasOwn(contentChange, 'hunks');
}

function renderTextDiffHunks(
    hunks: Extract<ModifiedFile['contentChange'], { readonly hunks: readonly unknown[]; }>['hunks'],
    hunkIndent: string,
    colors: Colors
): readonly string[] {
    return hunks.flatMap(function (hunk) {
        return [
            `${hunkIndent}${colors.dim(hunk.header)}`,
            ...hunk.lines.map(function (line) {
                return `${hunkIndent}${renderDiffLine(line, colors)}`;
            })
        ];
    });
}

function renderAddedFileLines(node: PathTreeFileNode<AddedFile>, colors: Colors): readonly string[] {
    return [ renderSizedFileRow(node, fileMarker.added, colors.green, colors) ];
}

function renderRemovedFileLines(node: PathTreeFileNode<RemovedFile>, colors: Colors): readonly string[] {
    return [ renderSizedFileRow(node, fileMarker.removed, colors.red, colors) ];
}

function renderModifiedHunks(node: PathTreeFileNode<ModifiedFile>, colors: Colors): readonly string[] {
    if (!hasRenderedHunks(node.item.contentChange)) {
        return [];
    }

    return renderTextDiffHunks(
        node.item.contentChange.hunks,
        indent(node.depth + hunkIndentDepthIncrement),
        colors
    );
}

function renderModifiedFileLines(node: PathTreeFileNode<ModifiedFile>, colors: Colors): readonly string[] {
    return [
        renderModifiedHeading(node, colors),
        ...renderModifiedHunks(node, colors)
    ];
}

function renderTreeGroup<T extends AnyFile>(
    group: TreeGroupRenderer<T>,
    colors: Colors
): readonly string[] {
    if (group.files.length === 0) {
        return [];
    }

    const tree = buildPathTree(group.files, function (file) {
        return file.path;
    });
    return [
        `  ${colors.bold(`${group.title} (${group.files.length})`)}`,
        ...tree.flatMap(function (node): readonly string[] {
            if (node.type === pathTreeNodeType.directory) {
                return [ renderDirectoryLine(node, colors) ];
            }
            return group.renderFileLines(node, colors);
        })
    ];
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

function renderFirstPublishPackageLines(pkg: PackageReleaseDiff, colors: Colors): readonly string[] {
    return [
        `${colors.bold(pkg.name)}  ${colors.dim(pkg.versionTransition)}`,
        `  ${colors.yellow('[first publish]')}  ${colors.dim('showing all bundled files as added')}`,
        ...renderTreeGroup(
            { title: 'Added', files: pkg.files.added, renderFileLines: renderAddedFileLines },
            colors
        )
    ];
}

function renderChangedPackageLines(pkg: PackageReleaseDiff, colors: Colors): readonly string[] {
    const summary = renderHeaderSummary(pkg.files, pkg.files.unchanged.length);
    return [
        `${colors.bold(pkg.name)}  ${colors.dim(pkg.versionTransition)}  ${colors.dim(`·  ${summary}`)}`,
        ...renderTreeGroup(
            { title: 'Added', files: pkg.files.added, renderFileLines: renderAddedFileLines },
            colors
        ),
        ...renderTreeGroup(
            { title: 'Removed', files: pkg.files.removed, renderFileLines: renderRemovedFileLines },
            colors
        ),
        ...renderTreeGroup(
            { title: 'Modified', files: pkg.files.modified, renderFileLines: renderModifiedFileLines },
            colors
        )
    ];
}

function renderPackageLines(pkg: PackageReleaseDiff, colors: Colors): readonly string[] {
    if (pkg.state === packageReleaseDiffState.unchanged) {
        return [ renderUnchangedPackage(pkg, colors) ];
    }

    if (pkg.state === packageReleaseDiffState.firstPublish) {
        return renderFirstPublishPackageLines(pkg, colors);
    }

    return renderChangedPackageLines(pkg, colors);
}

export function renderReleaseDiffPackage(pkg: PackageReleaseDiff, colors: Colors): string {
    return renderPackageLines(pkg, colors).join('\n');
}
