import assert from 'node:assert';
import { suite, test } from 'mocha';
import { validationPackageConfigurationFactory } from '../test-libraries/configuration-fixtures.ts';
import type { PackageConfiguration, PackageConfigurationsByName } from './configuration.ts';
import { buildPackageGraph } from './package-graph-builder.ts';

function packageWith(name: string, bundleDependencies: readonly string[] = []): PackageConfiguration {
    return validationPackageConfigurationFactory.build({ name, bundleDependencies });
}

function configurations(...packages: readonly PackageConfiguration[]): PackageConfigurationsByName {
    return Object.fromEntries(packages.map(function (packageConfiguration) {
        return [ packageConfiguration.name, packageConfiguration ];
    }));
}

suite('package-graph-builder', function () {
    test('buildPackageGraph returns a graph with no nodes when no packages are provided', function () {
        const graph = buildPackageGraph({});

        assert.strictEqual(graph.hasNode('any'), false);
    });

    test('buildPackageGraph adds a node for every package even when there are no dependencies', function () {
        const graph = buildPackageGraph(configurations(packageWith('a'), packageWith('b')));

        assert.strictEqual(graph.hasNode('a'), true);
        assert.strictEqual(graph.hasNode('b'), true);
    });

    test('buildPackageGraph connects bundle dependencies between package nodes', function () {
        const graph = buildPackageGraph(configurations(packageWith('a', [ 'b' ]), packageWith('b')));

        assert.strictEqual(graph.hasConnection({ from: 'a', to: 'b' }), true);
    });

    test('buildPackageGraph does not connect a bundle dependency that has no incoming edge', function () {
        const graph = buildPackageGraph(configurations(packageWith('a'), packageWith('b')));

        assert.strictEqual(graph.hasConnection({ from: 'a', to: 'b' }), false);
    });
});
