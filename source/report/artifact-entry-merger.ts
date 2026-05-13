import type { ArtifactBadge, ArtifactEntry } from '../progress/progress-broadcaster.ts';

// eslint-disable-next-line max-statements -- artifact entry merging intentionally reconciles rewrite and DCE state in one pass
export function mergeArtifactEntry(
    entry: ArtifactEntry,
    rewrittenSourcePaths: ReadonlySet<string>,
    transformedSourcePaths: ReadonlySet<string>
): ArtifactEntry {
    if (entry.sourcePath === undefined) {
        return entry;
    }
    const badgeSet = new Set<ArtifactBadge>(entry.badges);
    let { status } = entry;
    if (rewrittenSourcePaths.has(entry.sourcePath)) {
        badgeSet.add('import-path-rewrite');
        status = 'changed';
    }
    if (transformedSourcePaths.has(entry.sourcePath)) {
        badgeSet.add('dead-code-elimination');
        status = 'changed';
    }
    return {
        ...entry,
        status,
        badges: Array.from(badgeSet)
    };
}
