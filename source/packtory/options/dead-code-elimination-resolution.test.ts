import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { ValidConfigurationWithoutRegistryResult } from '../../configuration/validation.ts';
import {
    packageConfigurationFixture,
    validConfigurationWithoutRegistryFixture
} from '../../test-libraries/configuration-fixtures.ts';
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
): ValidConfigurationWithoutRegistryResult {
    return validConfigurationWithoutRegistryFixture({
        commonPackageSettings: common === undefined ? undefined : { deadCodeElimination: common },
        packages: packages.map(function (packageEntry) {
            return packageConfigurationFixture({
                name: packageEntry.name,
                deadCodeElimination: packageEntry.enabled === undefined ? undefined : { enabled: packageEntry.enabled }
            });
        })
    });
}

suite('dead-code-elimination-resolution', function () {
    test('resolveDeadCodeEliminationByName produces one entry per declared package', function () {
        const map = resolveDeadCodeEliminationByName(validated([ { name: 'package-a' }, { name: 'package-b' } ]));
        assert.deepStrictEqual(Array.from(map.keys()), [ 'package-a', 'package-b' ]);
    });

    test('resolveDeadCodeEliminationByName uses the package-level enabled flag when one is provided', function () {
        const map = resolveDeadCodeEliminationByName(validated([ { name: 'package-a', enabled: false } ]));
        assert.strictEqual(map.get('package-a')?.enabled, false);
    });

    test('resolveDeadCodeEliminationByName falls back to the common enabled flag when the package has no override', function () {
        const map = resolveDeadCodeEliminationByName(validated([ { name: 'package-a' } ], { enabled: false }));
        assert.strictEqual(map.get('package-a')?.enabled, false);
    });

    test('resolveDeadCodeEliminationByName returns undefined when neither the package nor the common settings define the setting', function () {
        const map = resolveDeadCodeEliminationByName(validated([ { name: 'package-a' } ]));
        assert.strictEqual(map.get('package-a'), undefined);
    });
});
