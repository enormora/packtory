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
type ReleaseDiffPackageRendererOptions = {
    readonly filesOnly: boolean;
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
    const directoryName = colors.bold(`▸ ${node.name}/`);
    return `${indent(node.depth)}${directoryName}`;
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
    const size = colors.dim(`(${sizeDelta})`);
    const modeChange = renderModeChangeSuffix(file, colors);
    const annotation = renderModifiedAnnotation(file, colors);
    return `${indent(node.depth)}${colors.yellow(fileMarker.modified)} ${node.name} ${size}${modeChange}${annotation}`;
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

function renderModifiedFileNameLines(node: PathTreeFileNode<ModifiedFile>, colors: Colors): readonly string[] {
    return [ renderModifiedHeading(node, colors) ];
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
    const groupTitle = colors.bold(`${group.title} (${group.files.length})`);
    return [
        `  ${groupTitle}`,
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

function renderUnchangedPackage(packageDiff: PackageReleaseDiff, colors: Colors): string {
    const packageName = colors.bold(packageDiff.name);
    return colors.dim(`${packageName}  ${packageDiff.previousVersionLabel}  ·  no changes`);
}

function renderFirstPublishPackageLines(packageDiff: PackageReleaseDiff, colors: Colors): readonly string[] {
    return [
        `${colors.bold(packageDiff.name)}  ${colors.dim(packageDiff.versionTransition)}`,
        `  ${colors.yellow('[first publish]')}  ${colors.dim('showing all bundled files as added')}`,
        ...renderTreeGroup(
            { title: 'Added', files: packageDiff.files.added, renderFileLines: renderAddedFileLines },
            colors
        )
    ];
}

function renderChangedPackageLines(
    packageDiff: PackageReleaseDiff,
    colors: Colors,
    options: ReleaseDiffPackageRendererOptions
): readonly string[] {
    const summary = renderHeaderSummary(packageDiff.files, packageDiff.files.unchanged.length);
    const packageName = colors.bold(packageDiff.name);
    const versionTransition = colors.dim(packageDiff.versionTransition);
    const summaryLabel = colors.dim(`·  ${summary}`);
    return [
        `${packageName}  ${versionTransition}  ${summaryLabel}`,
        ...renderTreeGroup(
            { title: 'Added', files: packageDiff.files.added, renderFileLines: renderAddedFileLines },
            colors
        ),
        ...renderTreeGroup(
            { title: 'Removed', files: packageDiff.files.removed, renderFileLines: renderRemovedFileLines },
            colors
        ),
        ...renderTreeGroup(
            {
                title: 'Modified',
                files: packageDiff.files.modified,
                renderFileLines: options.filesOnly ? renderModifiedFileNameLines : renderModifiedFileLines
            },
            colors
        )
    ];
}

function renderPackageLines(
    packageDiff: PackageReleaseDiff,
    colors: Colors,
    options: ReleaseDiffPackageRendererOptions
): readonly string[] {
    if (packageDiff.state === packageReleaseDiffState.unchanged) {
        return [ renderUnchangedPackage(packageDiff, colors) ];
    }

    if (packageDiff.state === packageReleaseDiffState.firstPublish) {
        return renderFirstPublishPackageLines(packageDiff, colors);
    }

    return renderChangedPackageLines(packageDiff, colors, options);
}

export function renderReleaseDiffPackage(
    packageDiff: PackageReleaseDiff,
    colors: Colors,
    options: ReleaseDiffPackageRendererOptions
): string {
    return renderPackageLines(packageDiff, colors, options).join('\n');
}
