import assert from 'node:assert';
import { suite, test } from 'mocha';
import { validationPackageConfigFactory } from '../test-libraries/config-fixtures.ts';
import type { PackageConfig, PackageConfigsByName } from './config.ts';
import { validateDependenciesExist } from './dependency-existence-validation.ts';

function packageWith(
    name: string,
    overrides: {
        readonly bundleDependencies?: readonly string[];
        readonly bundlePeerDependencies?: readonly string[];
    } = {}
): PackageConfig {
    return validationPackageConfigFactory.build({ name, ...overrides }) as unknown as PackageConfig;
}

function configs(...packages: readonly PackageConfig[]): PackageConfigsByName {
    return Object.fromEntries(packages.map((packageConfig) => [packageConfig.name, packageConfig]));
}

suite('dependency-existence-validation', function () {
    test('validateDependenciesExist returns no issues when every bundle dependency points to a known package', function () {
        const result = validateDependenciesExist(
            configs(packageWith('a', { bundleDependencies: ['b'] }), packageWith('b'))
        );

        assert.deepStrictEqual(result, []);
    });

    test('validateDependenciesExist reports bundle dependencies that point to unknown packages', function () {
        const result = validateDependenciesExist(configs(packageWith('a', { bundleDependencies: ['missing'] })));

        assert.deepStrictEqual(result, ['Bundle dependency "missing" referenced in "a" does not exist']);
    });

    test('validateDependenciesExist reports bundle peer dependencies that point to unknown packages', function () {
        const result = validateDependenciesExist(configs(packageWith('a', { bundlePeerDependencies: ['missing'] })));

        assert.deepStrictEqual(result, ['Bundle peer dependency "missing" referenced in "a" does not exist']);
    });

    test('validateDependenciesExist returns no issues when a package has no declared dependencies', function () {
        assert.deepStrictEqual(validateDependenciesExist(configs(packageWith('a'))), []);
    });
});
