import assert from 'node:assert';
import { suite, test } from 'mocha';
import { compareCanaryApis } from './canary-comparison.ts';
import type { PackageApiInspection, TypeExportNames } from './package-api-inspection.ts';

const emptyTypeExports: TypeExportNames = { namespace: [], type: [], value: [] };

function inspection(overrides: Partial<PackageApiInspection['packages'][number]>): PackageApiInspection {
    return {
        packages: [
            {
                binTargets: [],
                name: 'pkg',
                publicExports: [],
                typeDiagnostics: [],
                ...overrides
            }
        ]
    };
}

suite('canary-comparison', function () {
    test('compareCanaryApis reports missing public export specifiers as regressions', function () {
        const result = compareCanaryApis(
            inspection({
                publicExports: [
                    {
                        runtimeExportNames: [],
                        runtimeImportError: '',
                        specifier: 'pkg/feature',
                        typeExportNames: emptyTypeExports
                    }
                ]
            }),
            inspection({})
        );

        assert.deepStrictEqual(result.issues, [
            {
                kind: 'regression',
                message: 'Package "pkg" export "pkg/feature" exists in the npm baseline but is missing from source'
            }
        ]);
    });

    test('compareCanaryApis reports runtime and type export removals', function () {
        const result = compareCanaryApis(
            inspection({
                publicExports: [
                    {
                        runtimeExportNames: [ 'api' ],
                        runtimeImportError: '',
                        specifier: 'pkg',
                        typeExportNames: { namespace: [], type: [ 'Options' ], value: [ 'api' ] }
                    }
                ]
            }),
            inspection({
                publicExports: [
                    {
                        runtimeExportNames: [],
                        runtimeImportError: '',
                        specifier: 'pkg',
                        typeExportNames: emptyTypeExports
                    }
                ]
            })
        );

        assert.deepStrictEqual(result.issues, [
            {
                kind: 'regression',
                message: 'Package "pkg" export "pkg" is missing runtime export "api"'
            },
            {
                kind: 'regression',
                message: 'Package "pkg" export "pkg" is missing type export "Options"'
            },
            {
                kind: 'regression',
                message: 'Package "pkg" export "pkg" is missing value export "api"'
            }
        ]);
    });

    test('compareCanaryApis reports missing bin targets', function () {
        const result = compareCanaryApis(
            inspection({ binTargets: [ 'pkg -> ./cli.js' ] }),
            inspection({ binTargets: [] })
        );

        assert.deepStrictEqual(result.issues, [
            {
                kind: 'regression',
                message: 'Package "pkg" is missing bin target "pkg -> ./cli.js"'
            }
        ]);
    });

    test('compareCanaryApis treats baseline import failures as baseline rot', function () {
        const result = compareCanaryApis(
            inspection({
                publicExports: [
                    {
                        runtimeExportNames: [],
                        runtimeImportError: 'boom',
                        specifier: 'pkg',
                        typeExportNames: emptyTypeExports
                    }
                ]
            }),
            inspection({
                publicExports: [
                    {
                        runtimeExportNames: [],
                        runtimeImportError: 'source boom',
                        specifier: 'pkg',
                        typeExportNames: emptyTypeExports
                    }
                ]
            })
        );

        assert.deepStrictEqual(result.issues, [
            {
                kind: 'baseline-rot',
                message: [
                    'Package "pkg" export "pkg" fails runtime import checks.',
                    '',
                    'npm baseline error:',
                    'boom',
                    '',
                    'source error:',
                    'source boom'
                ]
                    .join('\n')
            }
        ]);
    });

    test('compareCanaryApis reports source runtime import failure details', function () {
        const result = compareCanaryApis(
            inspection({
                publicExports: [
                    {
                        runtimeExportNames: [],
                        runtimeImportError: '',
                        specifier: 'pkg',
                        typeExportNames: emptyTypeExports
                    }
                ]
            }),
            inspection({
                publicExports: [
                    {
                        runtimeExportNames: [],
                        runtimeImportError: 'source stack',
                        specifier: 'pkg',
                        typeExportNames: emptyTypeExports
                    }
                ]
            })
        );

        assert.deepStrictEqual(result.issues, [
            {
                kind: 'regression',
                message: [
                    'Package "pkg" export "pkg" fails runtime import checks.',
                    '',
                    'source error:',
                    'source stack'
                ]
                    .join('\n')
            }
        ]);
    });

    test('compareCanaryApis reports new TypeScript diagnostics', function () {
        const result = compareCanaryApis(
            inspection({ typeDiagnostics: [ 'TS1000: existing' ] }),
            inspection({ typeDiagnostics: [ 'TS1000: existing', 'TS1001: new' ] })
        );

        assert.deepStrictEqual(result.issues, [
            {
                kind: 'baseline-rot',
                message: 'Package "pkg" has an npm baseline TypeScript diagnostic: TS1000: existing'
            },
            {
                kind: 'regression',
                message: 'Package "pkg" has a new TypeScript diagnostic: TS1001: new'
            }
        ]);
    });
});
