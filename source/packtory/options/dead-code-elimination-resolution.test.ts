import assert from 'node:assert';
import { test } from 'mocha';
import type { ValidConfigWithoutRegistryResult } from '../../config/validation.ts';
import { resolveDeadCodeEliminationByName } from './dead-code-elimination-resolution.ts';

function validated(
    packages: readonly { readonly name: string; readonly enabled?: boolean }[],
    common?: { readonly enabled: boolean }
): ValidConfigWithoutRegistryResult {
    return {
        packtoryConfig: {
            commonPackageSettings: common === undefined ? undefined : { deadCodeElimination: common },
            packages: packages.map((pkg) => ({
                name: pkg.name,
                deadCodeElimination: pkg.enabled === undefined ? undefined : { enabled: pkg.enabled }
            }))
        }
    } as unknown as ValidConfigWithoutRegistryResult;
}

test('resolveDeadCodeEliminationByName produces one entry per declared package', () => {
    const map = resolveDeadCodeEliminationByName(validated([{ name: 'pkg-a' }, { name: 'pkg-b' }]));
    assert.deepStrictEqual(Array.from(map.keys()), ['pkg-a', 'pkg-b']);
});

test('resolveDeadCodeEliminationByName uses the package-level enabled flag when one is provided', () => {
    const map = resolveDeadCodeEliminationByName(validated([{ name: 'pkg-a', enabled: false }]));
    assert.strictEqual(map.get('pkg-a')?.enabled, false);
});

test('resolveDeadCodeEliminationByName falls back to the common enabled flag when the package has no override', () => {
    const map = resolveDeadCodeEliminationByName(validated([{ name: 'pkg-a' }], { enabled: false }));
    assert.strictEqual(map.get('pkg-a')?.enabled, false);
});

test('resolveDeadCodeEliminationByName returns undefined when neither the package nor the common settings define the setting', () => {
    const map = resolveDeadCodeEliminationByName(validated([{ name: 'pkg-a' }]));
    assert.strictEqual(map.get('pkg-a'), undefined);
});
