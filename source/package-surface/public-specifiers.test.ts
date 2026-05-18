import assert from 'node:assert';
import { test } from 'mocha';
import { rootWithSource } from '../test-libraries/package-surface-fixtures.ts';
import type { BundleLike } from './package-shape.ts';
import { getPublicModuleSpecifierForSourcePath, resolvePublicModuleSourceFilePath } from './public-specifiers.ts';

const mainRoots = { main: rootWithSource('/src/index.js', 'index.js') };

const explicitBundle: BundleLike = {
    name: 'package-a',
    roots: mainRoots,
    contents: [],
    surface: {
        mode: 'explicit',
        packageInterface: { modules: [{ root: 'main', export: '.' }] }
    }
};

const implicitBundle: BundleLike = {
    name: 'package-a',
    roots: mainRoots,
    contents: [],
    surface: { mode: 'implicit', defaultModuleRoot: 'main' }
};

test('getPublicModuleSpecifierForSourcePath dispatches to the explicit builder for explicit surfaces', () => {
    assert.strictEqual(getPublicModuleSpecifierForSourcePath(explicitBundle, '/src/index.js'), 'package-a');
});

test('getPublicModuleSpecifierForSourcePath dispatches to the implicit builder for implicit surfaces', () => {
    assert.strictEqual(getPublicModuleSpecifierForSourcePath(implicitBundle, '/src/index.js'), 'package-a');
});

test('resolvePublicModuleSourceFilePath dispatches to the explicit resolver for explicit surfaces', () => {
    assert.strictEqual(resolvePublicModuleSourceFilePath(explicitBundle, 'package-a'), '/src/index.js');
});

test('resolvePublicModuleSourceFilePath dispatches to the implicit resolver for implicit surfaces', () => {
    assert.strictEqual(resolvePublicModuleSourceFilePath(implicitBundle, 'package-a'), '/src/index.js');
});
