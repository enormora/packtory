/* eslint-disable @typescript-eslint/consistent-type-assertions -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { ModuleKind, ModuleResolutionKind } from 'ts-morph';
import { analyzationOptionsToCompilerOptions } from './typescript-compiler-options.ts';

const stubMainPackageJson = { name: 'pkg', version: '1.0.0', type: 'module' } as never;

suite('typescript-compiler-options', function () {
    test('analyzationOptionsToCompilerOptions returns Node16 module resolution and module kinds', function () {
        const options = analyzationOptionsToCompilerOptions({
            resolveDeclarationFiles: true,
            mainPackageJson: stubMainPackageJson
        });

        assert.partialDeepStrictEqual(options, {
            moduleResolution: ModuleResolutionKind.Node16,
            module: ModuleKind.Node16
        });
    });

    test('analyzationOptionsToCompilerOptions enables esModuleInterop, allowJs, resolveJsonModule, noLib, skipLibCheck, and noEmit', function () {
        const options = analyzationOptionsToCompilerOptions({
            resolveDeclarationFiles: true,
            mainPackageJson: stubMainPackageJson
        });

        assert.partialDeepStrictEqual(options, {
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

        assert.partialDeepStrictEqual(options, {
            types: [],
            typeRoots: []
        });
    });

    test('analyzationOptionsToCompilerOptions omits types and typeRoots when declaration-file resolution is enabled', function () {
        const options = analyzationOptionsToCompilerOptions({
            resolveDeclarationFiles: true,
            mainPackageJson: stubMainPackageJson
        });

        assert.partialDeepStrictEqual(options, {
            types: undefined,
            typeRoots: undefined
        });
    });
});
