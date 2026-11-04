import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { WorkspaceSnapshot } from '../inspectors/inspect-workspace.ts';
import { compareWorkspace } from './workspace-snapshot-comparison.ts';

const empty: WorkspaceSnapshot = {
    imports: [],
    files: [],
    modules: [],
    dependencies: {},
    peerDependencies: {},
    exports: '{}',
    executables: '{}'
};

suite('workspace comparison', function () {
    test('reports dependency removal, range changes, and peer group moves', function () {
        const rows = compareWorkspace(
            { ...empty, dependencies: { removed: '1', moved: '2', changed: '3' } },
            { ...empty, dependencies: { changed: '4' }, peerDependencies: { moved: '2' } }
        );
        assert.deepStrictEqual(rows, [
            { label: 'dependencies: changed', before: '3', after: '4' },
            { label: 'dependencies: moved', before: '2', after: 'absent' },
            { label: 'dependencies: removed', before: '1', after: 'absent' },
            { label: 'peerDependencies: moved', before: 'absent', after: '2' }
        ]);
    });

    test('keeps unresolved exports unknown rather than claiming removal', function () {
        const rows = compareWorkspace(
            { ...empty, modules: [ { specifier: 'pkg', values: [ 'value' ], types: [ 'Shape' ], complete: true } ] },
            { ...empty, modules: [ { specifier: 'pkg', values: [], types: [], complete: false } ] }
        );
        assert.ok(rows.some(function (row) {
            return row.label === 'pkg values: value' && row.after === 'unknown';
        }));
        assert.ok(rows.some(function (row) {
            return row.label === 'pkg types: Shape' && row.after === 'unknown';
        }));
    });

    test('preserves unchanged rows for the all-files view', function () {
        const snapshot = { ...empty, dependencies: { retained: '^1.0.0' } };
        assert.deepStrictEqual(compareWorkspace(snapshot, snapshot), [
            { label: 'dependencies: retained', before: '^1.0.0', after: '^1.0.0' }
        ]);
    });
});
