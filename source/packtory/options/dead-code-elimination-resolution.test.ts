import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { ValidConfigWithoutRegistryResult } from '../../config/validation.ts';
import { resolveDeadCodeEliminationByName } from './dead-code-elimination-resolution.ts';

type PackageInput = {
    readonly enabled?: boolean | undefined;
    readonly name: string;
};

type CommonInput = {
    readonly enabled: boolean;
};

function validated(
    packages: readonly PackageInput[],
    common?: CommonInput
): ValidConfigWithoutRegistryResult {
    return {
        packtoryConfig: {
            commonPackageSettings: common === undefined ? undefined : { deadCodeElimination: common },
            packages: packages.map(function (pkg) {
                return {
                    name: pkg.name,
                    deadCodeElimination: pkg.enabled === undefined ? undefined : { enabled: pkg.enabled }
                };
            })
        }
    } as unknown as ValidConfigWithoutRegistryResult;
}

suite('dead-code-elimination-resolution', function () {
    test('resolveDeadCodeEliminationByName produces one entry per declared package', function () {
        const map = resolveDeadCodeEliminationByName(validated([ { name: 'pkg-a' }, { name: 'pkg-b' } ]));
        assert.deepStrictEqual(Array.from(map.keys()), [ 'pkg-a', 'pkg-b' ]);
    });

    test('resolveDeadCodeEliminationByName uses the package-level enabled flag when one is provided', function () {
        const map = resolveDeadCodeEliminationByName(validated([ { name: 'pkg-a', enabled: false } ]));
        assert.strictEqual(map.get('pkg-a')?.enabled, false);
    });

    test('resolveDeadCodeEliminationByName falls back to the common enabled flag when the package has no override', function () {
        const map = resolveDeadCodeEliminationByName(validated([ { name: 'pkg-a' } ], { enabled: false }));
        assert.strictEqual(map.get('pkg-a')?.enabled, false);
    });

    test('resolveDeadCodeEliminationByName returns undefined when neither the package nor the common settings define the setting', function () {
        const map = resolveDeadCodeEliminationByName(validated([ { name: 'pkg-a' } ]));
        assert.strictEqual(map.get('pkg-a'), undefined);
    });
});
