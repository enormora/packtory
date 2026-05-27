import { Maybe } from 'true-myth';
import type { BuildAndPublishResult } from '../packtory/package-processor.ts';
import type { ArtifactEntry } from '../progress/progress-broadcaster.ts';
import type { PreviewDocument, PreviewPackage } from '../report/preview/preview-document.ts';
import type { BuildReport, PackageReport } from '../report/aggregator/report-types.ts';
import type { AnalyzedBundleResource } from '../dead-code-eliminator/analyzed-bundle.ts';
import { versionedBundleWithManifest } from './bundle-fixtures.ts';

export function createAnalyzedResource(
    overrides: Partial<AnalyzedBundleResource['fileDescription']> = {}
): AnalyzedBundleResource {
    return {
        fileDescription: {
            sourceFilePath: overrides.sourceFilePath ?? '/workspace/src/index.js',
            targetFilePath: overrides.targetFilePath ?? 'src/index.js',
            content: overrides.content ?? 'export const kept = 1;\n',
            isExecutable: overrides.isExecutable ?? false
        },
        directDependencies: new Set<string>(),
        isExplicitlyIncluded: false,
        isSubstituted: false,
        analysis: {
            survivingBindings: new Set<string>(),
            sideEffectStatements: [],
            sideEffectImports: new Set<string>()
        }
    };
}

export function createBuildResultFixture(
    overrides: Partial<BuildAndPublishResult> & {
        readonly packageName?: string;
        readonly version?: string;
        readonly contents?: readonly AnalyzedBundleResource[];
    } = {}
): BuildAndPublishResult {
    const packageName = overrides.packageName ?? 'pkg-a';
    const version = overrides.version ?? '1.0.1';
    return {
        status: 'new-version',
        bundle: versionedBundleWithManifest({
            name: packageName,
            version,
            manifestFile: { filePath: 'package.json', content: '{}', isExecutable: false },
            packageJson: { name: packageName, version },
            contents: overrides.contents ?? [createAnalyzedResource()]
        }),
        extraFiles: [],
        previousReleaseArtifacts: Maybe.nothing(),
        ...overrides
    };
}

export function createArtifactEntryFixture(overrides: Partial<ArtifactEntry> = {}): ArtifactEntry {
    const kind = overrides.kind ?? 'source';
    return {
        path: overrides.path ?? (kind === 'manifest' ? 'package.json' : 'src/index.js'),
        sizeBytes: overrides.sizeBytes ?? (kind === 'manifest' ? 2 : 20),
        kind,
        status: overrides.status ?? (kind === 'manifest' ? 'generated' : 'changed'),
        badges: overrides.badges ?? [],
        ...(kind === 'source' ? { sourcePath: overrides.sourcePath ?? '/workspace/src/index.js' } : {}),
        ...(overrides.sourcePath === undefined || kind === 'source' ? {} : { sourcePath: overrides.sourcePath })
    };
}

export function createPackageReportFixture(overrides: Partial<PackageReport> = {}): PackageReport {
    return {
        decisions: {
            version: {
                previousVersion: '1.0.0',
                chosenVersion: '1.0.1',
                trigger: 'auto-patch-bump'
            }
        },
        outputs: {
            tarball: {
                totalBytes: 22,
                entries: [
                    createArtifactEntryFixture({
                        path: 'src/index.js',
                        sourcePath: '/workspace/src/index.js',
                        badges: ['dead-code-elimination']
                    }),
                    createArtifactEntryFixture({ kind: 'manifest', path: 'package.json', badges: [] })
                ]
            }
        },
        eliminatedSourceFiles: [
            { path: '/workspace/src/unused.js', reason: 'not-emitted-after-analysis', sourceBytes: 14 }
        ],
        timings: { publish: 5 },
        ...overrides
    };
}

export function createBuildReportFixture(overrides: Partial<BuildReport> = {}): BuildReport {
    return {
        schemaVersion: 1,
        generatedAt: '2026-05-11T00:00:00.000Z',
        packages: {
            'pkg-a': createPackageReportFixture()
        },
        aggregate: { crossBundleLinks: [] },
        ...overrides
    };
}

export function createPreviewPackageFixture(overrides: Partial<PreviewPackage> = {}): PreviewPackage {
    const changedArtifact = {
        ...createArtifactEntryFixture({
            path: 'src/index.js',
            sourcePath: '/workspace/src/index.js',
            badges: ['dead-code-elimination']
        }),
        diff: [
            {
                header: '@@ -1,1 +1,1 @@',
                lines: [
                    { type: 'remove', text: '-export const removed = 1;' },
                    { type: 'add', text: '+export const kept = 1;' }
                ]
            }
        ]
    };
    const {
        tree: overrideTree,
        changedArtifacts: overrideChangedArtifacts,
        artifactCounts: overrideArtifactCounts,
        ...rest
    } = overrides;
    const tree: PreviewPackage['tree'] = overrideTree ?? [
        {
            path: 'package.json',
            name: 'package.json',
            depth: 0,
            type: 'file',
            artifact: createArtifactEntryFixture({ kind: 'manifest', path: 'package.json', badges: [] })
        },
        {
            path: 'src',
            name: 'src',
            depth: 0,
            type: 'directory'
        },
        {
            path: 'src/index.js',
            name: 'index.js',
            depth: 1,
            type: 'file',
            artifact: changedArtifact
        }
    ];
    const changedArtifacts =
        overrideChangedArtifacts ??
        tree.flatMap((node) => {
            if (node.type !== 'file' || node.artifact.diff === undefined) {
                return [];
            }
            return [{ ...node.artifact, diff: node.artifact.diff }];
        });
    const artifactCounts =
        overrideArtifactCounts ??
        tree.reduce(
            (counts, node) => {
                if (node.type !== 'file') {
                    return counts;
                }
                return {
                    emitted: counts.emitted + 1,
                    changed: counts.changed + (node.artifact.status === 'changed' ? 1 : 0)
                };
            },
            { emitted: 0, changed: 0 }
        );

    return {
        name: 'pkg-a',
        versionTransition: '1.0.0 -> 1.0.1',
        hasChanges: true,
        openByDefault: true,
        tree,
        changedArtifacts,
        artifactCounts,
        eliminatedSourceFiles: [
            { path: '/workspace/src/unused.js', reason: 'not-emitted-after-analysis', sourceBytes: 14 }
        ],
        diagnostics: createPackageReportFixture({
            decisions: { linker: { rewrites: [] } },
            outputs: { tarball: { entries: [], totalBytes: 0 } }
        }),
        ...rest
    };
}

export function createManifestOnlyPreviewPackageFixture(overrides: Partial<PreviewPackage> = {}): PreviewPackage {
    return createPreviewPackageFixture({
        versionTransition: undefined,
        eliminatedSourceFiles: [],
        changedArtifacts: [],
        artifactCounts: { emitted: 1, changed: 0 },
        tree: [
            {
                path: 'package.json',
                name: 'package.json',
                depth: 0,
                type: 'file',
                artifact: createArtifactEntryFixture({ kind: 'manifest', path: 'package.json', badges: [] })
            }
        ],
        diagnostics: { decisions: {}, timings: {} },
        ...overrides
    });
}

export function createDirectoryDiffPreviewPackageFixture(overrides: Partial<PreviewPackage> = {}): PreviewPackage {
    return createPreviewPackageFixture({
        changedArtifacts: [],
        artifactCounts: { emitted: 0, changed: 0 },
        tree: [
            {
                path: 'src',
                name: 'src',
                depth: 0,
                type: 'directory'
            }
        ],
        ...overrides
    });
}

export function createPreviewDocumentFixture(overrides: Partial<PreviewDocument> = {}): PreviewDocument {
    return {
        title: 'Packtory preview',
        modeLabel: 'Dry run',
        previewable: true,
        resultType: 'success',
        summary: {
            totalPackages: 1,
            changedPackages: 1,
            unchangedPackages: 0,
            failedPackages: 0,
            emittedArtifacts: 2,
            changedArtifacts: 1,
            eliminatedSourceFiles: 1
        },
        issues: [],
        packages: [createPreviewPackageFixture()],
        report: createBuildReportFixture({
            packages: {
                'pkg-a': createPackageReportFixture({
                    decisions: { linker: { rewrites: [] } },
                    outputs: { tarball: { entries: [], totalBytes: 0 } }
                })
            }
        }),
        ...overrides
    };
}
