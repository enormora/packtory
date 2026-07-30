import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { ResolutionKind } from '@arethetypeswrong/core';
import type { PackageResolutionReport, ResolutionProblemReport } from './type-script-package-resolution.ts';
import { summarizeResolutionReport } from './type-script-resolution-summary.ts';

const checkedResolutionKinds: readonly ResolutionKind[] = [ 'node16-esm', 'bundler' ];

type ProblemOverrides = {
    readonly kind?: ResolutionProblemReport['kind'];
    readonly shortDescription?: string;
    readonly affectedResolutionKinds?: readonly ResolutionKind[];
    readonly affectedEntrypoints?: readonly string[];
};

function problem(overrides: ProblemOverrides = {}): ResolutionProblemReport {
    const defaults: ResolutionProblemReport = {
        kind: 'CJSResolvesToESM',
        shortDescription: 'Missing `export =`',
        affectedResolutionKinds: [ 'bundler' ],
        affectedEntrypoints: [ '.' ]
    };

    return { ...defaults, ...overrides };
}

function analyzedReport(
    problems: readonly ResolutionProblemReport[],
    entrypoints: readonly string[] = [ '.', './feature' ]
): PackageResolutionReport {
    return { kind: 'analyzed', entrypoints, problems };
}

function summarize(report: PackageResolutionReport): readonly string[] {
    return summarizeResolutionReport('pkg', report, checkedResolutionKinds);
}

suite('type-script-resolution-summary', function () {
    test('reports a package without declarations', function () {
        assert.deepStrictEqual(summarize({ kind: 'missing-declarations' }), [
            'Package "pkg" does not expose TypeScript declarations'
        ]);
    });

    test('reports no issues for a package without problems', function () {
        assert.deepStrictEqual(summarize(analyzedReport([])), []);
    });

    test('names the affected entrypoints and resolution kinds of a single problem', function () {
        assert.deepStrictEqual(
            summarize(analyzedReport([
                problem({ affectedResolutionKinds: [ 'bundler' ], affectedEntrypoints: [ './feature' ] })
            ])),
            [
                'Package "pkg" failed TypeScript integrity: Missing `export =` ' +
                'affecting entrypoints "./feature" in resolutions "bundler"'
            ]
        );
    });

    test('joins multiple entrypoints and resolution kinds with commas', function () {
        assert.deepStrictEqual(
            summarize(analyzedReport([
                problem({
                    affectedResolutionKinds: [ 'node16-esm', 'bundler' ],
                    affectedEntrypoints: [ '.', './feature' ]
                })
            ])),
            [
                'Package "pkg" failed TypeScript integrity: Missing `export =` ' +
                'affecting entrypoints ".", "./feature" in resolutions "node16-esm", "bundler"'
            ]
        );
    });

    suite('problem groups', function () {
        test('groups problems of the same kind into one summary counting the findings', function () {
            assert.deepStrictEqual(
                summarize(analyzedReport([
                    problem({ affectedEntrypoints: [ '.' ] }),
                    problem({ affectedEntrypoints: [ './feature' ] })
                ])),
                [
                    'Package "pkg" failed TypeScript integrity: Missing `export =` (2 findings) ' +
                    'affecting entrypoints ".", "./feature" in resolutions "bundler"'
                ]
            );
        });

        test('names every resolution kind that any problem of a group affects', function () {
            assert.deepStrictEqual(
                summarize(analyzedReport([
                    problem({ affectedResolutionKinds: [ 'bundler' ] }),
                    problem({ affectedResolutionKinds: [ 'node16-esm' ] })
                ])),
                [
                    'Package "pkg" failed TypeScript integrity: Missing `export =` (2 findings) ' +
                    'affecting entrypoints "." in resolutions "node16-esm", "bundler"'
                ]
            );
        });

        test('keeps problems of different kinds apart', function () {
            assert.deepStrictEqual(
                summarize(analyzedReport([
                    problem({ kind: 'CJSResolvesToESM', shortDescription: 'Missing `export =`' }),
                    problem({ kind: 'UnexpectedModuleSyntax', shortDescription: 'Unexpected module syntax' })
                ])),
                [
                    'Package "pkg" failed TypeScript integrity: Missing `export =` ' +
                    'affecting entrypoints "." in resolutions "bundler"',
                    'Package "pkg" failed TypeScript integrity: Unexpected module syntax ' +
                    'affecting entrypoints "." in resolutions "bundler"'
                ]
            );
        });

        test('orders entrypoints as the package declares them', function () {
            assert.deepStrictEqual(
                summarize(analyzedReport(
                    [
                        problem({ affectedEntrypoints: [ './feature' ] }),
                        problem({ affectedEntrypoints: [ '.' ] })
                    ],
                    [ '.', './feature' ]
                )),
                [
                    'Package "pkg" failed TypeScript integrity: Missing `export =` (2 findings) ' +
                    'affecting entrypoints ".", "./feature" in resolutions "bundler"'
                ]
            );
        });

        test('orders resolution kinds as the rule checks them', function () {
            assert.deepStrictEqual(
                summarize(analyzedReport([ problem({ affectedResolutionKinds: [ 'bundler', 'node16-esm' ] }) ])),
                [
                    'Package "pkg" failed TypeScript integrity: Missing `export =` ' +
                    'affecting entrypoints "." in resolutions "node16-esm", "bundler"'
                ]
            );
        });
    });

    test('ignores problems that affect none of the checked resolution kinds', function () {
        assert.deepStrictEqual(summarize(analyzedReport([ problem({ affectedResolutionKinds: [] }) ])), []);
    });

    test('omits the entrypoint list when a problem affects no entrypoint', function () {
        assert.deepStrictEqual(
            summarize(analyzedReport([ problem({ affectedEntrypoints: [] }) ])),
            [ 'Package "pkg" failed TypeScript integrity: Missing `export =` in resolutions "bundler"' ]
        );
    });
});
