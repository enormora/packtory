/* eslint-disable sonarjs/no-nested-template-literals, @stylistic/max-len -- terminal rendering is intentionally linear and string-heavy */
import { buildPathTree, type PathTreeFileNode, type PathTreeNode } from '../../common/path-tree.ts';
import type {
    AddedFile,
    FileSetDiff,
    ModifiedFile,
    PackageReleaseDiff,
    RemovedFile
} from '../release-diff/file-set-diff.ts';
import { formatTerminalBytes } from './terminal-artifact-renderer.ts';
import { renderDiffLine, type Colors } from './terminal-preview-renderer-shared.ts';

type AnyFile = AddedFile | ModifiedFile | RemovedFile;

const fileMarker = { added: '+', modified: '~', removed: '-' } as const;

function indent(depth: number): string {
    return `  ${'  '.repeat(depth)}`;
}

function renderDirectoryLine(node: Extract<PathTreeNode<AnyFile>, { type: 'directory' }>, colors: Colors): string {
    return `${indent(node.depth)}${colors.bold(`▸ ${node.name}/`)}`;
}

function renderAddedRow(node: PathTreeFileNode<AddedFile>, colors: Colors): string {
    return `${indent(node.depth)}${colors.green(fileMarker.added)} ${node.name} ${colors.dim(`(${formatTerminalBytes(node.item.sizeBytes)})`)}`.trimEnd();
}

function renderRemovedRow(node: PathTreeFileNode<RemovedFile>, colors: Colors): string {
    return `${indent(node.depth)}${colors.red(fileMarker.removed)} ${node.name} ${colors.dim(`(${formatTerminalBytes(node.item.sizeBytes)})`)}`.trimEnd();
}

function renderModeChangeSuffix(file: ModifiedFile, colors: Colors): string {
    const oldMode = file.oldIsExecutable ? '755' : '644';
    const newMode = file.newIsExecutable ? '755' : '644';
    return colors.yellow(` mode ${oldMode} -> ${newMode}`);
}

function modifiedAnnotation(file: ModifiedFile, colors: Colors): string {
    if (file.contentChange.kind === 'binary') {
        return colors.dim(' (binary, no text diff)');
    }
    if (file.contentChange.kind === 'mode-only') {
        return colors.dim(' (mode only)');
    }
    return '';
}

function renderModifiedHeading(node: PathTreeFileNode<ModifiedFile>, colors: Colors): string {
    const file = node.item;
    const sizeDelta = `${formatTerminalBytes(file.oldSizeBytes)} -> ${formatTerminalBytes(file.newSizeBytes)}`;
    const modeSuffix = file.oldIsExecutable === file.newIsExecutable ? '' : renderModeChangeSuffix(file, colors);
    const annotation = modifiedAnnotation(file, colors);
    return `${indent(node.depth)}${colors.yellow(fileMarker.modified)} ${node.name} ${colors.dim(`(${sizeDelta})`)}${modeSuffix}${annotation}`.trimEnd();
}

const hunkIndentDepthIncrement = 2;

function renderModifiedHunks(node: PathTreeFileNode<ModifiedFile>, colors: Colors): readonly string[] {
    const file = node.item;
    if (file.contentChange.kind !== 'text') {
        return [];
    }
    const hunkIndent = indent(node.depth + hunkIndentDepthIncrement);
    const lines: string[] = [];
    for (const hunk of file.contentChange.hunks) {
        lines.push(`${hunkIndent}${colors.dim(hunk.header)}`);
        for (const line of hunk.lines) {
            lines.push(`${hunkIndent}${renderDiffLine(line, colors)}`);
        }
    }
    return lines;
}

function renderTreeGroup<T extends AnyFile>(
    title: string,
    files: readonly T[],
    renderFileLine: (node: PathTreeFileNode<T>, colors: Colors) => readonly string[],
    colors: Colors
): readonly string[] {
    if (files.length === 0) {
        return [];
    }
    const lines: string[] = [`  ${colors.bold(`${title} (${files.length})`)}`];
    const tree = buildPathTree(files, (file) => {
        return file.path;
    });
    for (const node of tree) {
        if (node.type === 'directory') {
            lines.push(renderDirectoryLine(node, colors));
        } else {
            lines.push(...renderFileLine(node, colors));
        }
    }
    return lines;
}

function renderAddedGroup(files: readonly AddedFile[], colors: Colors): readonly string[] {
    return renderTreeGroup(
        'Added',
        files,
        (node, fileColors) => {
            return [renderAddedRow(node, fileColors)];
        },
        colors
    );
}

function renderRemovedGroup(files: readonly RemovedFile[], colors: Colors): readonly string[] {
    return renderTreeGroup(
        'Removed',
        files,
        (node, fileColors) => {
            return [renderRemovedRow(node, fileColors)];
        },
        colors
    );
}

function renderModifiedGroup(files: readonly ModifiedFile[], colors: Colors): readonly string[] {
    return renderTreeGroup(
        'Modified',
        files,
        (node, fileColors) => {
            return [renderModifiedHeading(node, fileColors), ...renderModifiedHunks(node, fileColors)];
        },
        colors
    );
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

function renderFirstPublishPackage(pkg: PackageReleaseDiff, colors: Colors): string {
    const header = `${colors.bold(pkg.name)}  ${colors.dim(pkg.versionTransition)}`;
    const chip = `  ${colors.yellow('[first publish]')}  ${colors.dim('showing all bundled files as added')}`;
    const groups = renderAddedGroup(pkg.files.added, colors);
    return [header, chip, ...groups].join('\n');
}

function renderChangedPackage(pkg: PackageReleaseDiff, colors: Colors): string {
    const summary = renderHeaderSummary(pkg.files, pkg.files.unchanged.length);
    const header = `${colors.bold(pkg.name)}  ${colors.dim(pkg.versionTransition)}  ${colors.dim(`·  ${summary}`)}`;
    const groups = [
        ...renderAddedGroup(pkg.files.added, colors),
        ...renderRemovedGroup(pkg.files.removed, colors),
        ...renderModifiedGroup(pkg.files.modified, colors)
    ];
    return [header, ...groups].join('\n');
}

export function renderReleaseDiffPackage(pkg: PackageReleaseDiff, colors: Colors): string {
    if (pkg.state === 'unchanged') {
        return renderUnchangedPackage(pkg, colors);
    }
    if (pkg.state === 'first-publish') {
        return renderFirstPublishPackage(pkg, colors);
    }
    return renderChangedPackage(pkg, colors);
}
