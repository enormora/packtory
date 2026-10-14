import assert from 'node:assert';
import { suite, test } from 'mocha';
import { checkWithRegistry } from '../registry.ts';
import {
    assertFirstPackageSoftwareBillOfMaterials,
    assertFixturePublishResult,
    softwareBillOfMaterialsPackages
} from './publication-assertions.ts';
import {
    expectedFirstPackageVersion,
    expectedSecondPackageFirstRunVersion,
    expectedSecondPackageSecondRunVersion
} from './publish-fixture-expectations.ts';
import {
    assertPackageNotPublished,
    assertPublishSucceeded,
    createPackageConfiguration,
    createPackageConfigurationList,
    fetchPublishedPackage,
    getFixturePath,
    getPublishedFile,
    publishFixturePackages,
    publishTaggedRegistryVersion
} from './publish-fixture-support.ts';

suite('publish', function () {
    suite('publish cases 1', function () {
        test(
            'publishes the initial version of two packages in the first run and updates one of the two packages in the second run because the other did not change',
            checkWithRegistry(async function (registryDetails) {
                const firstRunFixture = getFixturePath('multiple-packages-with-substitution');
                await assertFixturePublishResult(
                    firstRunFixture,
                    registryDetails,
                    expectedSecondPackageFirstRunVersion
                );

                const secondRunFixture = getFixturePath('multiple-packages-with-substitution-slightly-modified');
                await assertFixturePublishResult(
                    secondRunFixture,
                    registryDetails,
                    expectedSecondPackageSecondRunVersion
                );
            })
        );

        test(
            'does not publish a new version when the same bundle is published twice unchanged',
            checkWithRegistry(async function (registryDetails) {
                const fixturePathValue = getFixturePath('multiple-packages-with-substitution');

                assertPublishSucceeded(
                    await publishFixturePackages({ fixturePath: fixturePathValue, registryDetails })
                );
                assertPublishSucceeded(
                    await publishFixturePackages({ fixturePath: fixturePathValue, registryDetails })
                );

                const latestVersionOfFirstPackage = await fetchPublishedPackage('first', registryDetails);
                const latestVersionOfSecondPackage = await fetchPublishedPackage('second', registryDetails);

                assert.deepStrictEqual(
                    {
                        version: latestVersionOfFirstPackage.version,
                        files: latestVersionOfFirstPackage.files
                    },
                    expectedFirstPackageVersion
                );
                assert.deepStrictEqual(
                    {
                        version: latestVersionOfSecondPackage.version,
                        files: latestVersionOfSecondPackage.files
                    },
                    expectedSecondPackageFirstRunVersion
                );
            })
        );

        test(
            'rejects an exact target version that already exists behind a non-latest tag before publishing other packages',
            checkWithRegistry(async function (registryDetails) {
                const fixturePathValue = getFixturePath('multiple-packages-with-substitution');
                await publishTaggedRegistryVersion({
                    name: 'second',
                    version: '0.0.1',
                    latestVersion: '0.0.0',
                    distTag: 'beta',
                    registryDetails
                });

                const result = await publishFixturePackages({ fixturePath: fixturePathValue, registryDetails });

                if (!result.isErr || result.error.type !== 'partial') {
                    assert.fail('Expected publish to fail with a partial result');
                }
                assert.strictEqual(result.error.succeeded.length, 0);
                assert.match(
                    result.error.failures[0]?.message ?? '',
                    /Package "second" version "0\.0\.1" already exists/u
                );
                await assertPackageNotPublished('first', registryDetails);
                const latestSecondPackage = await fetchPublishedPackage('second', registryDetails);
                assert.strictEqual(latestSecondPackage.version, '0.0.0');
            })
        );

        test(
            'dry-run publish succeeds through generated runtime export smoke checks',
            checkWithRegistry(async function (registryDetails) {
                const fixturePathValue = getFixturePath('multiple-packages-with-substitution');

                assertPublishSucceeded(
                    await publishFixturePackages({
                        fixturePath: fixturePathValue,
                        registryDetails,
                        dryRun: true
                    })
                );
            })
        );

        test(
            'publishes the configured manual version and keeps it stable for an unchanged rerun',
            checkWithRegistry(async function (registryDetails) {
                const fixturePathValue = getFixturePath('multiple-packages-with-substitution');
                const packages = createPackageConfigurationList(
                    createPackageConfiguration(fixturePathValue, 'first', 'entry1', {
                        versioning: { automatic: false, version: '3.2.1' }
                    })
                );

                assertPublishSucceeded(
                    await publishFixturePackages({ fixturePath: fixturePathValue, registryDetails, packages })
                );
                assertPublishSucceeded(
                    await publishFixturePackages({ fixturePath: fixturePathValue, registryDetails, packages })
                );

                const publishedPackage = await fetchPublishedPackage('first', registryDetails);

                assert.partialDeepStrictEqual(publishedPackage, {
                    version: '3.2.1',
                    manifest: {
                        version: '3.2.1'
                    }
                });
            })
        );

        test(
            'publishes successfully with explicit basic auth against the registry',
            checkWithRegistry(async function (registryDetails) {
                const fixturePathValue = getFixturePath('multiple-packages-with-substitution');
                const packages = createPackageConfigurationList(
                    createPackageConfiguration(fixturePathValue, 'first', 'entry1')
                );

                assertPublishSucceeded(
                    await publishFixturePackages({
                        fixturePath: fixturePathValue,
                        registryDetails,
                        packages,
                        authenticationMode: 'basic'
                    })
                );

                const publishedPackage = await fetchPublishedPackage('first', registryDetails);

                assert.partialDeepStrictEqual(publishedPackage, {
                    version: '0.0.1',
                    manifest: {
                        version: '0.0.1'
                    }
                });
            })
        );

        test(
            'publishes the configured minimumVersion for the first automatic publish',
            checkWithRegistry(async function (registryDetails) {
                const fixturePathValue = getFixturePath('multiple-packages-with-substitution');
                const packages = createPackageConfigurationList(
                    createPackageConfiguration(fixturePathValue, 'first', 'entry1', {
                        versioning: { automatic: true, minimumVersion: '1.2.3' }
                    })
                );

                assertPublishSucceeded(
                    await publishFixturePackages({ fixturePath: fixturePathValue, registryDetails, packages })
                );

                const publishedPackage = await fetchPublishedPackage('first', registryDetails);

                assert.partialDeepStrictEqual(publishedPackage, {
                    version: '1.2.3',
                    manifest: {
                        version: '1.2.3'
                    }
                });
            })
        );

        test(
            'publishes bundle peer dependencies into peerDependencies and keeps the substituted imports',
            checkWithRegistry(async function (registryDetails) {
                const fixturePathValue = getFixturePath('multiple-packages-with-substitution');
                const packages = createPackageConfigurationList(
                    createPackageConfiguration(fixturePathValue, 'first', 'entry1'),
                    createPackageConfiguration(fixturePathValue, 'second', 'entry2', {
                        bundleDependencies: [ 'first' ]
                    }),
                    createPackageConfiguration(fixturePathValue, 'third', 'entry3', {
                        bundleDependencies: [ 'first' ],
                        bundlePeerDependencies: [ 'second' ]
                    })
                );

                assertPublishSucceeded(
                    await publishFixturePackages({ fixturePath: fixturePathValue, registryDetails, packages })
                );

                const publishedPackage = await fetchPublishedPackage('third', registryDetails);

                assert.partialDeepStrictEqual(publishedPackage, {
                    manifest: {
                        dependencies: { first: '0.0.1' },
                        peerDependencies: { second: '0.0.1' }
                    }
                });
                assert.strictEqual(
                    getPublishedFile(publishedPackage, 'package/foo.js').content,
                    "import { bar } from 'second';\nexport const foo = 'foo';\n//# sourceMappingURL=foo.js.map\n"
                );
                assert.strictEqual(
                    getPublishedFile(publishedPackage, 'package/entry3.d.ts').content,
                    "export declare const foo: import('first/foo.d.ts').Foo;\n"
                );
            })
        );

        test(
            'includes a CycloneDX SBOM next to the manifest when SBOM is enabled',
            checkWithRegistry(async function (registryDetails) {
                const fixturePathValue = getFixturePath('multiple-packages-with-substitution');
                const packages = softwareBillOfMaterialsPackages(fixturePathValue);

                assertPublishSucceeded(
                    await publishFixturePackages({ fixturePath: fixturePathValue, registryDetails, packages })
                );

                const firstPackage = await fetchPublishedPackage('first', registryDetails);
                const softwareBillOfMaterialsFile = getPublishedFile(
                    firstPackage,
                    'package/software-bill-of-materials.cyclonedx.json'
                );
                const softwareBillOfMaterials = JSON.parse(softwareBillOfMaterialsFile.content) as Record<
                    string,
                    unknown
                >;

                assertFirstPackageSoftwareBillOfMaterials(softwareBillOfMaterials);
            })
        );

        test(
            'omits retained private authoring imports from SBOM package dependencies',
            checkWithRegistry(async function (registryDetails) {
                const fixturePathValue = getFixturePath('multiple-packages-with-substitution');
                const packages = createPackageConfigurationList(
                    createPackageConfiguration(fixturePathValue, 'first', 'entry1', {
                        packageInterface: { modules: [ { export: '.', root: 'main' } ] },
                        publishSettings: { access: 'public', softwareBillOfMaterials: { enabled: true } }
                    }),
                    createPackageConfiguration(fixturePathValue, 'second', 'entry2', {
                        bundleDependencies: [ 'first' ],
                        publishSettings: { access: 'public', softwareBillOfMaterials: { enabled: true } }
                    })
                );

                assertPublishSucceeded(
                    await publishFixturePackages({ fixturePath: fixturePathValue, registryDetails, packages })
                );

                const secondPackage = await fetchPublishedPackage('second', registryDetails);
                const softwareBillOfMaterialsFile = getPublishedFile(
                    secondPackage,
                    'package/software-bill-of-materials.cyclonedx.json'
                );
                const softwareBillOfMaterials = JSON.parse(softwareBillOfMaterialsFile.content) as {
                    readonly components: readonly {
                        readonly name: string;
                        readonly version: string;
                        readonly 'bom-ref': string;
                        readonly scope: string;
                    }[];
                    readonly dependencies: readonly {
                        readonly reference: string;
                        readonly dependsOn?: readonly string[];
                    }[];
                };

                assert.partialDeepStrictEqual(softwareBillOfMaterials, {
                    metadata: { component: { name: 'second', version: '0.0.1', 'bom-ref': 'pkg:npm/second@0.0.1' } },
                    components: [],
                    dependencies: []
                });
            })
        );
    });

    suite('publish cases 2', function () {
        test(
            'publishes retained private modules without exposing private package paths',
            checkWithRegistry(async function (registryDetails) {
                const fixturePathValue = getFixturePath('substitution-type-check');
                const packages = createPackageConfigurationList(
                    createPackageConfiguration(fixturePathValue, 'package-a', 'a-entry', {
                        packageInterface: { modules: [ { export: '.', root: 'main' } ] }
                    }),
                    createPackageConfiguration(fixturePathValue, 'package-b', 'b-entry', {
                        bundleDependencies: [ 'package-a' ]
                    })
                );
                assertPublishSucceeded(
                    await publishFixturePackages({
                        fixturePath: fixturePathValue,
                        registryDetails,
                        packages
                    })
                );
                const publishedProducer = await fetchPublishedPackage('package-a', registryDetails);
                const publishedConsumer = await fetchPublishedPackage('package-b', registryDetails);
                assert.deepStrictEqual(publishedProducer.manifest.exports, {
                    '.': { import: './a-entry.js', types: './a-entry.d.ts' }
                });
                assert.deepStrictEqual(publishedConsumer.manifest.exports, {
                    '.': { import: './b-entry.js', types: './b-entry.d.ts' }
                });
                assert.strictEqual(
                    getPublishedFile(publishedConsumer, 'package/internal.js').content,
                    "export const internal = 'internal';\n"
                );
            })
        );

        test(
            'produces byte-identical SBOMs across two unchanged publish runs',
            checkWithRegistry(async function (registryDetails) {
                const fixturePathValue = getFixturePath('multiple-packages-with-substitution');
                const packages = createPackageConfigurationList(
                    createPackageConfiguration(fixturePathValue, 'first', 'entry1', {
                        publishSettings: { access: 'public', softwareBillOfMaterials: { enabled: true } }
                    })
                );

                assertPublishSucceeded(
                    await publishFixturePackages({ fixturePath: fixturePathValue, registryDetails, packages })
                );
                const firstRun = await fetchPublishedPackage('first', registryDetails);

                assertPublishSucceeded(
                    await publishFixturePackages({ fixturePath: fixturePathValue, registryDetails, packages })
                );
                const secondRun = await fetchPublishedPackage('first', registryDetails);

                assert.strictEqual(
                    getPublishedFile(secondRun, 'package/software-bill-of-materials.cyclonedx.json').content,
                    getPublishedFile(firstRun, 'package/software-bill-of-materials.cyclonedx.json').content
                );
                assert.strictEqual(secondRun.version, firstRun.version);
            })
        );

        test(
            'rejects publishing a bundle whose external dependency uses a mutable git+https specifier',
            checkWithRegistry(async function (registryDetails) {
                const fixturePathValue = getFixturePath('with-local-builtin-and-node-module-dependencies');
                const packages = createPackageConfigurationList({
                    name: 'mutable-rejection-fixture',
                    roots: { main: { javaScript: `${fixturePathValue}/source/entry.js` } }
                });

                const result = await publishFixturePackages({
                    fixturePath: fixturePathValue,
                    registryDetails,
                    packages,
                    mainPackageManifestOverrides: {
                        dependencies: { 'example-module': 'git+https://github.com/our-fork/example-module#v1.0.0' }
                    }
                });

                if (result.isOk) {
                    assert.fail('Expected publish to fail');
                }
                if (result.error.type !== 'partial') {
                    assert.fail(`Expected partial failure, got ${result.error.type}`);
                }
                const failureMessages = result.error.failures.map(function (failure) {
                    return failure.message;
                });
                assert.ok(
                    failureMessages.some(function (message) {
                        return message.includes('uses a mutable specifier') && message.includes('example-module');
                    }),
                    `Expected a mutable-specifier failure, got: ${failureMessages.join(' | ')}`
                );

                await assertPackageNotPublished('mutable-rejection-fixture', registryDetails);
            })
        );

        test(
            'allows a mutable git+https specifier when the dep is allow-listed and preserves it in the published manifest',
            checkWithRegistry(async function (registryDetails) {
                const fixturePathValue = getFixturePath('with-local-builtin-and-node-module-dependencies');
                const packages = createPackageConfigurationList({
                    name: 'mutable-allow-list-fixture',
                    roots: { main: { javaScript: `${fixturePathValue}/source/entry.js` } }
                });

                assertPublishSucceeded(
                    await publishFixturePackages({
                        fixturePath: fixturePathValue,
                        registryDetails,
                        packages,
                        mainPackageManifestOverrides: {
                            dependencies: { 'example-module': 'git+https://github.com/our-fork/example-module#v1.0.0' }
                        },
                        commonPackageSettings: {
                            dependencyPolicy: { allowMutableSpecifiers: [ 'example-module' ] }
                        }
                    })
                );

                const publishedPackage = await fetchPublishedPackage('mutable-allow-list-fixture', registryDetails);

                assert.deepStrictEqual(publishedPackage.manifest.dependencies, {
                    'example-module': 'git+https://github.com/our-fork/example-module#v1.0.0'
                });
            })
        );

        test(
            'merges common and per-package publish settings in a single happy path',
            checkWithRegistry(async function (registryDetails) {
                const fixturePathValue = getFixturePath('multiple-packages-with-substitution');
                const packages = createPackageConfigurationList(
                    createPackageConfiguration(fixturePathValue, 'first', 'entry1', {
                        additionalFiles: [
                            {
                                inputFilePath: `${fixturePathValue}/documentation/first.txt`,
                                targetFilePath: 'documentation/first.txt'
                            }
                        ],
                        additionalPackageManifestAttributes: {
                            description: 'first package'
                        }
                    })
                );

                assertPublishSucceeded(
                    await publishFixturePackages({
                        fixturePath: fixturePathValue,
                        registryDetails,
                        packages,
                        commonPackageSettings: {
                            includeSourceMapFiles: true,
                            additionalFiles: [
                                {
                                    inputFilePath: `${fixturePathValue}/documentation/common.txt`,
                                    targetFilePath: 'documentation/common.txt'
                                }
                            ],
                            additionalPackageManifestAttributes: {
                                license: 'MIT'
                            }
                        }
                    })
                );

                const publishedPackage = await fetchPublishedPackage('first', registryDetails);

                assert.partialDeepStrictEqual(publishedPackage, {
                    manifest: {
                        license: 'MIT',
                        description: 'first package'
                    }
                });
                assert.strictEqual(
                    getPublishedFile(publishedPackage, 'package/entry1.js.map').content,
                    '{"version":3,"file":"entry.js","sourceRoot":"","sources":["./source/entry.ts"],"names":[],"mappings":""}\n'
                );
                assert.strictEqual(
                    getPublishedFile(publishedPackage, 'package/qux.js.map').content,
                    '{"version":3,"file":"entry.js","sourceRoot":"","sources":["./source/entry.ts"],"names":[],"mappings":""}\n'
                );
                assert.strictEqual(
                    getPublishedFile(publishedPackage, 'package/documentation/common.txt').content,
                    'common file\n'
                );
                assert.strictEqual(
                    getPublishedFile(publishedPackage, 'package/documentation/first.txt').content,
                    'package file\n'
                );
            })
        );
    });
});
