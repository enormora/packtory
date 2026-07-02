import assert from 'node:assert';
import { suite, test } from 'mocha';
import { stagedForApproval } from '../../bundle-emitter/publication-outcome.ts';
import type { MutablePackageReport } from './report-types.ts';
import { toPackageReport } from './package-report-materialization.ts';

function mutable(overrides: Partial<MutablePackageReport> = {}): MutablePackageReport {
    return { decisions: {}, timings: {}, ...overrides };
}

suite('package-report-materialization', function () {
    test('toPackageReport returns only decisions and timings when no other sections are populated', function () {
        assert.deepStrictEqual(toPackageReport(mutable()), { decisions: {}, timings: {} });
    });

    test('toPackageReport materializes inputs from roots and provides defaults for sibling versions and source count', function () {
        const result = toPackageReport(mutable({ roots: { main: 'src/index.js' } }));

        assert.deepStrictEqual(result.inputs, {
            roots: { main: 'src/index.js' },
            siblingVersions: {},
            sourceFileCount: 0
        });
    });

    test('toPackageReport includes effectiveConfig in inputs when it is provided', function () {
        const result = toPackageReport(mutable({ roots: {}, effectiveConfig: { feature: 'on' } }));

        assert.deepStrictEqual(result.inputs?.effectiveConfig, { feature: 'on' });
    });

    test('toPackageReport omits inputs when neither roots nor effectiveConfig is provided', function () {
        const result = toPackageReport(mutable({ timings: { build: 1 } }));

        assert.strictEqual(Object.hasOwn(result, 'inputs'), false);
    });

    test('toPackageReport omits outputs when no outputs entry exists on the mutable report', function () {
        const result = toPackageReport(mutable());

        assert.strictEqual(Object.hasOwn(result, 'outputs'), false);
    });

    test('toPackageReport keeps non-rewritten, non-transformed tarball entries unchanged in outputs', function () {
        const entry = {
            path: 'a.js',
            sizeBytes: 10,
            kind: 'source' as const,
            sourcePath: '/src/a.js',
            status: 'generated' as const,
            badges: [] as const
        };
        const result = toPackageReport(mutable({ outputs: { tarball: { entries: [ entry ], totalBytes: 10 } } }));

        if (result.outputs === undefined) {
            assert.fail('expected outputs to be present');
        }
        assert.strictEqual(result.outputs.tarball.totalBytes, 10);
        const firstEntry = result.outputs.tarball.entries[0];
        if (firstEntry === undefined) {
            assert.fail('expected at least one tarball entry');
        }
        assert.strictEqual(firstEntry.status, 'generated');
    });

    test('toPackageReport surfaces eliminatedSourceFiles when present on the mutable report', function () {
        const result = toPackageReport(
            mutable({
                eliminatedSourceFiles: [ { path: '/src/dead.js', sourceBytes: 5, reason: 'no-uses' } ]
            })
        );

        assert.deepStrictEqual(result.eliminatedSourceFiles, [
            { path: '/src/dead.js', sourceBytes: 5, reason: 'no-uses' }
        ]);
    });

    test('toPackageReport surfaces failure when present on the mutable report', function () {
        const result = toPackageReport(mutable({ failure: { stage: 'publish', message: 'boom' } }));

        assert.deepStrictEqual(result.failure, { stage: 'publish', message: 'boom' });
    });

    test('toPackageReport surfaces publication when present on the mutable report', function () {
        const result = toPackageReport(mutable({ publication: stagedForApproval('stage-123') }));

        assert.deepStrictEqual(result.publication, stagedForApproval('stage-123'));
    });

    test('toPackageReport applies the import-path-rewrite badge to tarball entries whose source path appears in decisions.linker.rewrites', function () {
        const entry = {
            path: 'index.js',
            sizeBytes: 10,
            kind: 'source' as const,
            sourcePath: '/src/index.js',
            status: 'unchanged' as const,
            badges: [] as const
        };
        const result = toPackageReport(
            mutable({
                outputs: { tarball: { entries: [ entry ], totalBytes: 10 } },
                decisions: {
                    linker: {
                        rewrites: [
                            {
                                file: '/src/index.js',
                                fromSpecifier: './dep.js',
                                toSpecifier: 'pkg-b',
                                targetBundle: 'pkg-b'
                            }
                        ]
                    }
                }
            })
        );

        const firstEntry = result.outputs?.tarball.entries[0];
        if (firstEntry === undefined) {
            assert.fail('expected an output entry');
        }
        assert.ok(firstEntry.badges.includes('import-path-rewrite'));
        assert.strictEqual(firstEntry.status, 'changed');
    });
});
