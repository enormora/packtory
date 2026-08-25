import assert from 'node:assert';
import { suite as describe, test as it } from 'mocha';
import type { FileAnalysis } from '../dead-code-eliminator/analyzed-bundle.ts';
import {
    bundleResource as bundleResourceFixture,
    versionedBundleWithManifest as versionedBundleFixture
} from '../test-libraries/bundle-fixtures.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import { createGraphFromResolvedBundle as createResolvedGraph, type ResourceGraph } from './resource-graph.ts';
import { substituteDependencies } from './substitute-bundles.ts';

function emptySubstitutionAnalysis(): FileAnalysis {
    return {
        survivingBindings: new Set<string>(),
        sideEffectStatements: [],
        sideEffectImports: new Set<string>()
    };
}

function peerBundleWithEntryExport(entryContent: string): VersionedBundleWithManifest {
    return versionedBundleFixture({
        name: 'peer-package',
        version: '21',
        roots: {
            main: {
                js: {
                    content: '',
                    isExecutable: false,
                    sourceFilePath: '/pkg-entry.js',
                    targetFilePath: 'pkg-entry.js'
                }
            }
        },
        surface: {
            mode: 'explicit',
            packageInterface: { modules: [ { root: 'main', export: './pkg-entry.js' } ] }
        },
        contents: [
            {
                ...bundleResourceFixture('/pkg-entry.js', {
                    targetFilePath: 'pkg-entry.js',
                    content: entryContent
                }),
                isSubstituted: false,
                analysis: emptySubstitutionAnalysis()
            },
            {
                ...bundleResourceFixture('/internal.js', { targetFilePath: 'internal.js' }),
                isSubstituted: false,
                analysis: emptySubstitutionAnalysis()
            }
        ],
        packageJson: { name: 'peer-package', version: '21' },
        exportsField: { './pkg-entry.js': { import: './pkg-entry.js' } },
        mainFile: { content: '', isExecutable: false, sourceFilePath: '/pkg-entry.js', targetFilePath: 'pkg-entry.js' },
        manifestFile: { content: '', isExecutable: false, filePath: '/package.json' }
    });
}

function peerBundleWithPublicOnly(): VersionedBundleWithManifest {
    return peerBundleWithEntryExport('export { Public } from "./internal.js";');
}

function peerBundleWithDefaultOnly(): VersionedBundleWithManifest {
    return peerBundleWithEntryExport('export { default } from "./internal.js";');
}

function buildInputGraph(entryContent: string): ResourceGraph {
    const internalContent = 'export default 0; export const Private = 1; export const Public = 2;';
    const project = createProject({
        withFiles: [
            { filePath: '/entry.js', content: entryContent },
            { filePath: '/internal.js', content: internalContent }
        ]
    });
    const root = {
        js: { content: '', isExecutable: false, sourceFilePath: '/entry.js', targetFilePath: 'entry.js' },
        declarationFile: undefined
    } as const;
    return createResolvedGraph({
        contents: [
            {
                ...bundleResourceFixture('/entry.js', {
                    content: entryContent,
                    directDependencies: new Set([ '/internal.js' ])
                }),
                project
            },
            { ...bundleResourceFixture('/internal.js', { content: internalContent }), project }
        ],
        roots: { main: root },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' },
        externalDependencies: new Map(),
        name: 'test-bundle'
    });
}

function assertSymbolRejected(entryContent: string): void {
    const inputGraph = buildInputGraph(entryContent);

    assert.throws(function () {
        substituteDependencies(inputGraph, [], [ peerBundleWithPublicOnly() ]);
    }, /^Error: Package "peer-package" does not expose "\/internal\.js" for cross-package substitution$/u);
}

function assertSubstituted(
    entryContent: string,
    peerBundle: VersionedBundleWithManifest,
    expectedContent: string
): void {
    const inputGraph = buildInputGraph(entryContent);
    const substitutedGraph = substituteDependencies(inputGraph, [], [ peerBundle ]);
    const result = substitutedGraph.flatten([ '/entry.js' ]);

    assert.strictEqual(result.contents[0]?.fileDescription.content, expectedContent);
}

describe('substitute-bundles symbol requirements', function () {
    describe('accepted rewrites', function () {
        it('rewrites named imports exported by peer public entrypoints', function () {
            assertSubstituted(
                'import { Public } from "./internal.js";',
                peerBundleWithPublicOnly(),
                'import { Public } from "peer-package/pkg-entry.js";'
            );
        });

        it('rewrites default imports exported by peer public entrypoints', function () {
            assertSubstituted(
                'import Private from "./internal.js";',
                peerBundleWithDefaultOnly(),
                'import Private from "peer-package/pkg-entry.js";'
            );
        });

        it('rewrites named re-exports exported by peer public entrypoints', function () {
            assertSubstituted(
                'export { Public } from "./internal.js";',
                peerBundleWithPublicOnly(),
                'export { Public } from "peer-package/pkg-entry.js";'
            );
        });
    });

    describe('rejected rewrites', function () {
        it('rejects missing named imports from peer public entrypoints', function () {
            assertSymbolRejected('import { Private } from "./internal.js";');
        });

        it('rejects missing symbols across duplicate imports from peer public entrypoints', function () {
            assertSymbolRejected(
                'import { Private } from "./internal.js";\nimport { Public } from "./internal.js";'
            );
        });

        it('rejects missing default imports from peer public entrypoints', function () {
            assertSymbolRejected('import Private from "./internal.js";');
        });

        it('rejects missing namespace imports from peer public entrypoints', function () {
            assertSymbolRejected('import * as internal from "./internal.js";');
        });

        it('rejects missing named re-exports from peer public entrypoints', function () {
            assertSymbolRejected('export { Private } from "./internal.js";');
        });

        it('rejects missing namespace re-exports from peer public entrypoints', function () {
            assertSymbolRejected('export * as internal from "./internal.js";');
        });
    });
});
