/* eslint-disable @typescript-eslint/consistent-type-assertions -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { test } from 'mocha';
import { ModuleKind, ModuleResolutionKind } from 'ts-morph';
import { analyzationOptionsToCompilerOptions } from './typescript-compiler-options.ts';

const stubMainPackageJson = { name: 'pkg', version: '1.0.0', type: 'module' } as never;

test('analyzationOptionsToCompilerOptions returns Node16 module resolution and module kinds', () => {
    const options = analyzationOptionsToCompilerOptions({
        resolveDeclarationFiles: true,
        mainPackageJson: stubMainPackageJson
    });

    assert.strictEqual(options.moduleResolution, ModuleResolutionKind.Node16);
    assert.strictEqual(options.module, ModuleKind.Node16);
});

test('analyzationOptionsToCompilerOptions enables esModuleInterop, allowJs, noLib, skipLibCheck, and noEmit', () => {
    const options = analyzationOptionsToCompilerOptions({
        resolveDeclarationFiles: true,
        mainPackageJson: stubMainPackageJson
    });

    assert.strictEqual(options.esModuleInterop, true);
    assert.strictEqual(options.allowJs, true);
    assert.strictEqual(options.noLib, true);
    assert.strictEqual(options.skipLibCheck, true);
    assert.strictEqual(options.noEmit, true);
});

test('analyzationOptionsToCompilerOptions clears types and typeRoots when declaration-file resolution is disabled', () => {
    const options = analyzationOptionsToCompilerOptions({
        resolveDeclarationFiles: false,
        mainPackageJson: stubMainPackageJson
    });

    assert.deepStrictEqual(options.types, []);
    assert.deepStrictEqual(options.typeRoots, []);
});

test('analyzationOptionsToCompilerOptions omits types and typeRoots when declaration-file resolution is enabled', () => {
    const options = analyzationOptionsToCompilerOptions({
        resolveDeclarationFiles: true,
        mainPackageJson: stubMainPackageJson
    });

    assert.strictEqual(options.types, undefined);
    assert.strictEqual(options.typeRoots, undefined);
});
