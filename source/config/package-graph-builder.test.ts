import assert from 'node:assert';
import { suite, test } from 'mocha';
import { validationPackageConfigFactory } from '../test-libraries/config-fixtures.ts';
import type { PackageConfig, PackageConfigsByName } from './config.ts';
import { buildPackageGraph } from './package-graph-builder.ts';

function packageWith(name: string, bundleDependencies: readonly string[] = []): PackageConfig {
    return validationPackageConfigFactory.build({ name, bundleDependencies });
}

function configs(...packages: readonly PackageConfig[]): PackageConfigsByName {
    return Object.fromEntries(packages.map(function (packageConfig) {
        return [ packageConfig.name, packageConfig ];
    }));
}

suite('package-graph-builder', function () {
    test('buildPackageGraph returns a graph with no nodes when no packages are provided', function () {
        const graph = buildPackageGraph({});

        assert.strictEqual(graph.hasNode('any'), false);
    });

    test('buildPackageGraph adds a node for every package even when there are no dependencies', function () {
        const graph = buildPackageGraph(configs(packageWith('a'), packageWith('b')));

        assert.strictEqual(graph.hasNode('a'), true);
        assert.strictEqual(graph.hasNode('b'), true);
    });

    test('buildPackageGraph connects bundle dependencies between package nodes', function () {
        const graph = buildPackageGraph(configs(packageWith('a', [ 'b' ]), packageWith('b')));

        assert.strictEqual(graph.hasConnection({ from: 'a', to: 'b' }), true);
    });

    test('buildPackageGraph does not connect a bundle dependency that has no incoming edge', function () {
        const graph = buildPackageGraph(configs(packageWith('a'), packageWith('b')));

        assert.strictEqual(graph.hasConnection({ from: 'a', to: 'b' }), false);
    });
});
