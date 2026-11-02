import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { WorkspaceSnapshot } from '../inspectors/inspect-workspace.ts';
import { createPackageReportFixture, createArtifactEntryFixture } from '../../test-libraries/preview-fixtures.ts';
import { compareWorkspace, buildWorkspaceComparison } from './workspace-comparison.ts';

const empty: WorkspaceSnapshot = {
    files: [],
    imports: [],
    modules: [],
    dependencies: {},
    peerDependencies: {},
    exports: '{}',
    executables: '{}'
};
const known = { specifier: 'pkg', values: [ 'value' ], types: [ 'Shape' ], complete: true };
const unknown = { ...known, values: [], types: [], complete: false };

suite('workspace comparison contract', function () {
    test('reports additions and removals in both namespaces', function () {
        const snapshot = { ...empty, modules: [ known ] };
        assert.deepStrictEqual(compareWorkspace(empty, snapshot), [
            { label: 'pkg values: value', before: 'absent', after: 'exported' },
            { label: 'pkg types: Shape', before: 'absent', after: 'exported' }
        ]);
        assert.deepStrictEqual(compareWorkspace(snapshot, empty), [
            { label: 'pkg values: value', before: 'exported', after: 'absent' },
            { label: 'pkg types: Shape', before: 'exported', after: 'absent' }
        ]);
    });

    test('preserves retained names and distinguishes unknown exports from absence', function () {
        assert.deepStrictEqual(compareWorkspace({ ...empty, modules: [ known ] }, { ...empty, modules: [ known ] }), [
            { label: 'pkg values: value', before: 'exported', after: 'exported' },
            { label: 'pkg types: Shape', before: 'exported', after: 'exported' }
        ]);
        assert.deepStrictEqual(compareWorkspace({ ...empty, modules: [ unknown ] }, { ...empty, modules: [ known ] }), [
            { label: 'pkg values: value', before: 'unknown', after: 'exported' },
            { label: 'pkg values', before: 'unknown exports', after: 'resolved' },
            { label: 'pkg types: Shape', before: 'unknown', after: 'exported' },
            { label: 'pkg types', before: 'unknown exports', after: 'resolved' }
        ]);
        assert.deepStrictEqual(
            compareWorkspace({ ...empty, modules: [ unknown ] }, { ...empty, modules: [ unknown ] }),
            [
                { label: 'pkg values', before: 'unknown exports', after: 'unknown exports' },
                { label: 'pkg types', before: 'unknown exports', after: 'unknown exports' }
            ]
        );
    });

    test('keeps resolution diagnostics when a previously known surface becomes unknown', function () {
        assert.deepStrictEqual(compareWorkspace({ ...empty, modules: [ known ] }, { ...empty, modules: [ unknown ] }), [
            { label: 'pkg values: value', before: 'exported', after: 'unknown' },
            { label: 'pkg values', before: 'resolved', after: 'unknown exports' },
            { label: 'pkg types: Shape', before: 'exported', after: 'unknown' },
            { label: 'pkg types', before: 'resolved', after: 'unknown exports' }
        ]);
    });

    test('compares export conditions and executable mappings', function () {
        assert.deepStrictEqual(
            compareWorkspace(empty, { ...empty, exports: '{".":"./index.js"}', executables: '{"cmd":"./cli.js"}' }),
            [
                { label: 'exports', before: '{}', after: '{".":"./index.js"}' },
                { label: 'executables', before: '{}', after: '{"cmd":"./cli.js"}' }
            ]
        );
    });

    test('maps emitted statuses to input files and keeps incomplete reports unavailable', function () {
        const workspaceSnapshot = {
            ...empty,
            files: [ { path: 'kept.js', sourcePath: '/source/kept.js', sizeBytes: 10 }, {
                path: 'removed.js',
                sourcePath: '/source/removed.js',
                sizeBytes: 20
            } ]
        };
        const result = buildWorkspaceComparison(
            createPackageReportFixture({ workspaceSnapshot, packageSnapshot: empty }),
            [ createArtifactEntryFixture({ path: 'kept.js', sourcePath: '/source/kept.js', status: 'unchanged' }) ]
        );
        assert.deepStrictEqual(result, {
            comparisonRows: [],
            sourceTree: [
                {
                    type: 'file',
                    path: 'kept.js',
                    name: 'kept.js',
                    depth: 0,
                    artifact: {
                        path: 'kept.js',
                        sourcePath: '/source/kept.js',
                        sizeBytes: 10,
                        kind: 'source',
                        status: 'unchanged',
                        badges: []
                    }
                },
                {
                    type: 'file',
                    path: 'removed.js',
                    name: 'removed.js',
                    depth: 0,
                    artifact: {
                        path: 'removed.js',
                        sourcePath: '/source/removed.js',
                        sizeBytes: 20,
                        kind: 'source',
                        status: 'changed',
                        badges: []
                    }
                }
            ]
        });
        assert.deepStrictEqual(buildWorkspaceComparison(createPackageReportFixture(), []), {
            sourceTree: undefined,
            comparisonRows: undefined
        });
        assert.strictEqual(
            buildWorkspaceComparison(createPackageReportFixture({ workspaceSnapshot }), []).comparisonRows,
            undefined
        );
    });
});
