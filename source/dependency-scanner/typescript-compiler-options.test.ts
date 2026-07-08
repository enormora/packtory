/* eslint-disable @typescript-eslint/consistent-type-assertions -- test stubs cast partial mocks of complex orchestrator types */
import { suite, test } from 'mocha';
import { ModuleKind, ModuleResolutionKind } from 'ts-morph';
import { assertDeepSubset } from '../test-libraries/deep-subset-assertion.ts';
import { analyzationOptionsToCompilerOptions } from './typescript-compiler-options.ts';

const stubMainPackageJson = { name: 'pkg', version: '1.0.0', type: 'module' } as never;

suite('typescript-compiler-options', function () {
    test('analyzationOptionsToCompilerOptions returns Node16 module resolution and module kinds', function () {
        const options = analyzationOptionsToCompilerOptions({
            resolveDeclarationFiles: true,
            mainPackageJson: stubMainPackageJson
        });

        assertDeepSubset(options, {
            moduleResolution: ModuleResolutionKind.Node16,
            module: ModuleKind.Node16
        });
    });

    test('analyzationOptionsToCompilerOptions enables esModuleInterop, allowJs, resolveJsonModule, noLib, skipLibCheck, and noEmit', function () {
        const options = analyzationOptionsToCompilerOptions({
            resolveDeclarationFiles: true,
            mainPackageJson: stubMainPackageJson
        });

        assertDeepSubset(options, {
            esModuleInterop: true,
            allowJs: true,
            resolveJsonModule: true,
            noLib: true,
            skipLibCheck: true,
            noEmit: true
        });
    });

    test('analyzationOptionsToCompilerOptions clears types and typeRoots when declaration-file resolution is disabled', function () {
        const options = analyzationOptionsToCompilerOptions({
            resolveDeclarationFiles: false,
            mainPackageJson: stubMainPackageJson
        });

        assertDeepSubset(options, {
            types: [],
            typeRoots: []
        });
    });

    test('analyzationOptionsToCompilerOptions omits types and typeRoots when declaration-file resolution is enabled', function () {
        const options = analyzationOptionsToCompilerOptions({
            resolveDeclarationFiles: true,
            mainPackageJson: stubMainPackageJson
        });

        assertDeepSubset(options, {
            types: undefined,
            typeRoots: undefined
        });
    });
});
