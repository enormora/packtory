import assert from 'node:assert';
import { suite, test } from 'mocha';
import { compareCanaryApplicationProgrammingInterfaces } from './canary-comparison.ts';
import type {
    PackageApplicationProgrammingInterfaceInspection,
    TypeExportNames
} from './package-application-programming-interface-inspection.ts';

const emptyTypeExports: TypeExportNames = { namespace: [], type: [], value: [] };

function inspection(
    overrides: Partial<PackageApplicationProgrammingInterfaceInspection['packages'][number]>
): PackageApplicationProgrammingInterfaceInspection {
    return {
        packages: [
            {
                executableTargets: [],
                name: 'package',
                publicExports: [],
                typeDiagnostics: [],
                ...overrides
            }
        ]
    };
}

suite('canary-comparison', function () {
    test('compareCanaryApplicationProgrammingInterfaces reports missing public export specifiers as regressions', function () {
        const result = compareCanaryApplicationProgrammingInterfaces(
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
                message: 'Package "package" export "pkg/feature" exists in the npm baseline but is missing from source'
            }
        ]);
    });

    test('compareCanaryApplicationProgrammingInterfaces reports runtime and type export removals', function () {
        const result = compareCanaryApplicationProgrammingInterfaces(
            inspection({
                publicExports: [
                    {
                        runtimeExportNames: [ 'api' ],
                        runtimeImportError: '',
                        specifier: 'package',
                        typeExportNames: { namespace: [], type: [ 'Options' ], value: [ 'api' ] }
                    }
                ]
            }),
            inspection({
                publicExports: [
                    {
                        runtimeExportNames: [],
                        runtimeImportError: '',
                        specifier: 'package',
                        typeExportNames: emptyTypeExports
                    }
                ]
            })
        );

        assert.deepStrictEqual(result.issues, [
            {
                kind: 'regression',
                message: 'Package "package" export "package" is missing runtime export "api"'
            },
            {
                kind: 'regression',
                message: 'Package "package" export "package" is missing type export "Options"'
            },
            {
                kind: 'regression',
                message: 'Package "package" export "package" is missing value export "api"'
            }
        ]);
    });

    test('reports failed imports without inventing runtime export removals', function () {
        const result = compareCanaryApplicationProgrammingInterfaces(
            inspection({
                publicExports: [ {
                    runtimeExportNames: [ 'api' ],
                    runtimeImportError: '',
                    specifier: 'package',
                    typeExportNames: { namespace: [], type: [ 'Options' ], value: [] }
                } ]
            }),
            inspection({
                publicExports: [ {
                    runtimeExportNames: [],
                    runtimeImportError: 'source stack',
                    specifier: 'package',
                    typeExportNames: emptyTypeExports
                } ]
            })
        );
        assert.deepStrictEqual(result.issues, [
            {
                kind: 'regression',
                message:
                    'Package "package" export "package" fails runtime import checks.\n\nsource error:\nsource stack'
            },
            { kind: 'regression', message: 'Package "package" export "package" is missing type export "Options"' }
        ]);
    });

    test('compareCanaryApplicationProgrammingInterfaces reports missing bin targets', function () {
        const result = compareCanaryApplicationProgrammingInterfaces(
            inspection({ executableTargets: [ 'pkg -> ./cli.js' ] }),
            inspection({ executableTargets: [] })
        );

        assert.deepStrictEqual(result.issues, [
            {
                kind: 'regression',
                message: 'Package "package" is missing bin target "pkg -> ./cli.js"'
            }
        ]);
    });

    test('compareCanaryApplicationProgrammingInterfaces treats baseline import failures as baseline rot', function () {
        const result = compareCanaryApplicationProgrammingInterfaces(
            inspection({
                publicExports: [
                    {
                        runtimeExportNames: [],
                        runtimeImportError: 'boom',
                        specifier: 'package',
                        typeExportNames: emptyTypeExports
                    }
                ]
            }),
            inspection({
                publicExports: [
                    {
                        runtimeExportNames: [],
                        runtimeImportError: 'source boom',
                        specifier: 'package',
                        typeExportNames: emptyTypeExports
                    }
                ]
            })
        );

        assert.deepStrictEqual(result.issues, [
            {
                kind: 'baseline-rot',
                message: [
                    'Package "package" export "package" fails runtime import checks.',
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

    test('compareCanaryApplicationProgrammingInterfaces reports source runtime import failure details', function () {
        const result = compareCanaryApplicationProgrammingInterfaces(
            inspection({
                publicExports: [
                    {
                        runtimeExportNames: [],
                        runtimeImportError: '',
                        specifier: 'package',
                        typeExportNames: emptyTypeExports
                    }
                ]
            }),
            inspection({
                publicExports: [
                    {
                        runtimeExportNames: [],
                        runtimeImportError: 'source stack',
                        specifier: 'package',
                        typeExportNames: emptyTypeExports
                    }
                ]
            })
        );

        assert.deepStrictEqual(result.issues, [
            {
                kind: 'regression',
                message: [
                    'Package "package" export "package" fails runtime import checks.',
                    '',
                    'source error:',
                    'source stack'
                ]
                    .join('\n')
            }
        ]);
    });

    test('compareCanaryApplicationProgrammingInterfaces reports new TypeScript diagnostics', function () {
        const result = compareCanaryApplicationProgrammingInterfaces(
            inspection({ typeDiagnostics: [ 'TS1000: existing' ] }),
            inspection({ typeDiagnostics: [ 'TS1000: existing', 'TS1001: new' ] })
        );

        assert.deepStrictEqual(result.issues, [
            {
                kind: 'baseline-rot',
                message: 'Package "package" has an npm baseline TypeScript diagnostic: TS1000: existing'
            },
            {
                kind: 'regression',
                message: 'Package "package" has a new TypeScript diagnostic: TS1001: new'
            }
        ]);
    });
});
