import assert from 'node:assert';
import { suite, test } from 'mocha';
import { checkWithRegistry, type RegistryDetails } from '../registry.ts';
import {
    assertPackageNotPublished,
    assertPublishSucceeded,
    createPackageConfig,
    createPackageConfigList,
    fetchPublishedPackage,
    getFixturePath,
    getPublishedFile,
    publishFixturePackages
} from './publish-fixture-support.ts';
import {
    expectedFirstPackageVersion,
    expectedSecondPackageFirstRunVersion,
    expectedSecondPackageSecondRunVersion
} from './publish-fixture-expectations.ts';

async function assertFixturePublishResult(
    fixturePath: string,
    registryDetails: RegistryDetails,
    expectedSecondPackageVersion: Record<string, unknown>
): Promise<void> {
    const result = await publishFixturePackages({ fixturePath, registryDetails });
    assertPublishSucceeded(result);

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
        expectedSecondPackageVersion
    );
}

suite('publish', function () {
    test(
        'publishes the initial version of two packages in the first run and updates one of the two packages in the second run because the other did not change',
        checkWithRegistry(async (registryDetails) => {
            const firstRunFixture = getFixturePath('multiple-packages-with-substitution');
            await assertFixturePublishResult(firstRunFixture, registryDetails, expectedSecondPackageFirstRunVersion);

            const secondRunFixture = getFixturePath('multiple-packages-with-substitution-slightly-modified');
            await assertFixturePublishResult(secondRunFixture, registryDetails, expectedSecondPackageSecondRunVersion);
        })
    );

    test(
        'does not publish a new version when the same bundle is published twice unchanged',
        checkWithRegistry(async (registryDetails) => {
            const fixturePathValue = getFixturePath('multiple-packages-with-substitution');

            assertPublishSucceeded(await publishFixturePackages({ fixturePath: fixturePathValue, registryDetails }));
            assertPublishSucceeded(await publishFixturePackages({ fixturePath: fixturePathValue, registryDetails }));

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
        'publishes the configured manual version and keeps it stable for an unchanged rerun',
        checkWithRegistry(async (registryDetails) => {
            const fixturePathValue = getFixturePath('multiple-packages-with-substitution');
            const packages = createPackageConfigList(
                createPackageConfig(fixturePathValue, 'first', 'entry1', {
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

            assert.strictEqual(publishedPackage.version, '3.2.1');
            assert.strictEqual(publishedPackage.manifest.version, '3.2.1');
        })
    );

    test(
        'publishes successfully with explicit basic auth against the registry',
        checkWithRegistry(async (registryDetails) => {
            const fixturePathValue = getFixturePath('multiple-packages-with-substitution');
            const packages = createPackageConfigList(createPackageConfig(fixturePathValue, 'first', 'entry1'));

            assertPublishSucceeded(
                await publishFixturePackages({
                    fixturePath: fixturePathValue,
                    registryDetails,
                    packages,
                    authMode: 'basic'
                })
            );

            const publishedPackage = await fetchPublishedPackage('first', registryDetails);

            assert.strictEqual(publishedPackage.version, '0.0.1');
            assert.strictEqual(publishedPackage.manifest.version, '0.0.1');
        })
    );

    test(
        'publishes the configured minimumVersion for the first automatic publish',
        checkWithRegistry(async (registryDetails) => {
            const fixturePathValue = getFixturePath('multiple-packages-with-substitution');
            const packages = createPackageConfigList(
                createPackageConfig(fixturePathValue, 'first', 'entry1', {
                    versioning: { automatic: true, minimumVersion: '1.2.3' }
                })
            );

            assertPublishSucceeded(
                await publishFixturePackages({ fixturePath: fixturePathValue, registryDetails, packages })
            );

            const publishedPackage = await fetchPublishedPackage('first', registryDetails);

            assert.strictEqual(publishedPackage.version, '1.2.3');
            assert.strictEqual(publishedPackage.manifest.version, '1.2.3');
        })
    );

    test(
        'publishes bundle peer dependencies into peerDependencies and keeps the substituted imports',
        checkWithRegistry(async (registryDetails) => {
            const fixturePathValue = getFixturePath('multiple-packages-with-substitution');
            const packages = createPackageConfigList(
                createPackageConfig(fixturePathValue, 'first', 'entry1'),
                createPackageConfig(fixturePathValue, 'second', 'entry2', { bundleDependencies: ['first'] }),
                createPackageConfig(fixturePathValue, 'third', 'entry3', {
                    bundleDependencies: ['first'],
                    bundlePeerDependencies: ['second']
                })
            );

            assertPublishSucceeded(
                await publishFixturePackages({ fixturePath: fixturePathValue, registryDetails, packages })
            );

            const publishedPackage = await fetchPublishedPackage('third', registryDetails);

            assert.deepStrictEqual(publishedPackage.manifest.dependencies, { first: '0.0.1' });
            assert.deepStrictEqual(publishedPackage.manifest.peerDependencies, { second: '0.0.1' });
            assert.strictEqual(
                getPublishedFile(publishedPackage, 'package/foo.js').content,
                "import { bar } from 'second/bar.js';\nexport const foo = 'foo';\n//# sourceMappingURL=foo.js.map\n"
            );
            assert.strictEqual(
                getPublishedFile(publishedPackage, 'package/entry3.d.ts').content,
                "export declare const foo: import('first/foo.d.ts').Foo;\n"
            );
        })
    );

    test(
        'includes a CycloneDX SBOM next to the manifest when SBOM is enabled',
        checkWithRegistry(async (registryDetails) => {
            const fixturePathValue = getFixturePath('multiple-packages-with-substitution');
            const packages = createPackageConfigList(
                createPackageConfig(fixturePathValue, 'first', 'entry1', {
                    publishSettings: { access: 'public', sbom: { enabled: true } }
                }),
                createPackageConfig(fixturePathValue, 'second', 'entry2', {
                    bundleDependencies: ['first'],
                    publishSettings: { access: 'public', sbom: { enabled: true } }
                })
            );

            assertPublishSucceeded(
                await publishFixturePackages({ fixturePath: fixturePathValue, registryDetails, packages })
            );

            const firstPackage = await fetchPublishedPackage('first', registryDetails);
            const sbomFile = getPublishedFile(firstPackage, 'package/sbom.cdx.json');
            const sbom = JSON.parse(sbomFile.content) as Record<string, unknown>;

            assert.strictEqual(sbom.bomFormat, 'CycloneDX');
            assert.strictEqual(sbom.specVersion, '1.6');
            const metadata = sbom.metadata as { component: { 'bom-ref': string; name: string; version: string } };
            assert.strictEqual(metadata.component['bom-ref'], 'pkg:npm/first@0.0.1');
            assert.strictEqual(metadata.component.name, 'first');
            assert.strictEqual(metadata.component.version, '0.0.1');
            assert.deepStrictEqual(sbom.components, []);
        })
    );

    test(
        'lists every dependency from the published manifest as an SBOM component',
        checkWithRegistry(async (registryDetails) => {
            const fixturePathValue = getFixturePath('multiple-packages-with-substitution');
            const packages = createPackageConfigList(
                createPackageConfig(fixturePathValue, 'first', 'entry1', {
                    publishSettings: { access: 'public', sbom: { enabled: true } }
                }),
                createPackageConfig(fixturePathValue, 'second', 'entry2', {
                    bundleDependencies: ['first'],
                    publishSettings: { access: 'public', sbom: { enabled: true } }
                })
            );

            assertPublishSucceeded(
                await publishFixturePackages({ fixturePath: fixturePathValue, registryDetails, packages })
            );

            const secondPackage = await fetchPublishedPackage('second', registryDetails);
            const sbomFile = getPublishedFile(secondPackage, 'package/sbom.cdx.json');
            const sbom = JSON.parse(sbomFile.content) as {
                components: readonly { name: string; version: string; 'bom-ref': string; scope: string }[];
                dependencies: readonly { ref: string; dependsOn?: readonly string[] }[];
            };

            assert.deepStrictEqual(sbom.components, [
                {
                    type: 'library',
                    name: 'first',
                    version: '0.0.1',
                    'bom-ref': 'pkg:npm/first@0.0.1',
                    scope: 'required',
                    purl: 'pkg:npm/first@0.0.1'
                }
            ]);
            const rootDep = sbom.dependencies.find((entry) => {
                return entry.ref === 'pkg:npm/second@0.0.1';
            });
            assert.deepStrictEqual(rootDep?.dependsOn, ['pkg:npm/first@0.0.1']);
        })
    );

    test(
        'produces byte-identical SBOMs across two unchanged publish runs',
        checkWithRegistry(async (registryDetails) => {
            const fixturePathValue = getFixturePath('multiple-packages-with-substitution');
            const packages = createPackageConfigList(
                createPackageConfig(fixturePathValue, 'first', 'entry1', {
                    publishSettings: { access: 'public', sbom: { enabled: true } }
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
                getPublishedFile(secondRun, 'package/sbom.cdx.json').content,
                getPublishedFile(firstRun, 'package/sbom.cdx.json').content
            );
            assert.strictEqual(secondRun.version, firstRun.version);
        })
    );

    test(
        'rejects publishing a bundle whose external dependency uses a mutable git+https specifier',
        checkWithRegistry(async (registryDetails) => {
            const fixturePathValue = getFixturePath('with-local-builtin-and-node-module-dependencies');
            const packages = createPackageConfigList({
                name: 'mutable-rejection-fixture',
                roots: { main: { js: `${fixturePathValue}/src/entry.js` } }
            });

            const result = await publishFixturePackages({
                fixturePath: fixturePathValue,
                registryDetails,
                packages,
                mainPackageJsonOverrides: {
                    dependencies: { 'example-module': 'git+https://github.com/our-fork/example-module#v1.0.0' }
                }
            });

            if (result.isOk) {
                assert.fail('Expected publish to fail');
            }
            if (result.error.type !== 'partial') {
                assert.fail(`Expected partial failure, got ${result.error.type}`);
            }
            const failureMessages = result.error.failures.map((failure) => {
                return failure.message;
            });
            assert.ok(
                failureMessages.some((message) => {
                    return message.includes('uses a mutable specifier') && message.includes('example-module');
                }),
                `Expected a mutable-specifier failure, got: ${failureMessages.join(' | ')}`
            );

            await assertPackageNotPublished('mutable-rejection-fixture', registryDetails);
        })
    );

    test(
        'allows a mutable git+https specifier when the dep is allow-listed and preserves it in the published manifest',
        checkWithRegistry(async (registryDetails) => {
            const fixturePathValue = getFixturePath('with-local-builtin-and-node-module-dependencies');
            const packages = createPackageConfigList({
                name: 'mutable-allow-list-fixture',
                roots: { main: { js: `${fixturePathValue}/src/entry.js` } }
            });

            assertPublishSucceeded(
                await publishFixturePackages({
                    fixturePath: fixturePathValue,
                    registryDetails,
                    packages,
                    mainPackageJsonOverrides: {
                        dependencies: { 'example-module': 'git+https://github.com/our-fork/example-module#v1.0.0' }
                    },
                    commonPackageSettings: {
                        dependencyPolicy: { allowMutableSpecifiers: ['example-module'] }
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
        checkWithRegistry(async (registryDetails) => {
            const fixturePathValue = getFixturePath('multiple-packages-with-substitution');
            const packages = createPackageConfigList(
                createPackageConfig(fixturePathValue, 'first', 'entry1', {
                    additionalFiles: [
                        {
                            sourceFilePath: `${fixturePathValue}/docs/first.txt`,
                            targetFilePath: 'docs/first.txt'
                        }
                    ],
                    additionalPackageJsonAttributes: {
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
                                sourceFilePath: `${fixturePathValue}/docs/common.txt`,
                                targetFilePath: 'docs/common.txt'
                            }
                        ],
                        additionalPackageJsonAttributes: {
                            license: 'MIT'
                        }
                    }
                })
            );

            const publishedPackage = await fetchPublishedPackage('first', registryDetails);

            assert.strictEqual(publishedPackage.manifest.license, 'MIT');
            assert.strictEqual(publishedPackage.manifest.description, 'first package');
            assert.strictEqual(
                getPublishedFile(publishedPackage, 'package/entry1.js.map').content,
                '{"version":3,"file":"entry.js","sourceRoot":"","sources":["./src/entry.ts"],"names":[],"mappings":""}\n'
            );
            assert.strictEqual(
                getPublishedFile(publishedPackage, 'package/qux.js.map').content,
                '{"version":3,"file":"entry.js","sourceRoot":"","sources":["./src/entry.ts"],"names":[],"mappings":""}\n'
            );
            assert.strictEqual(getPublishedFile(publishedPackage, 'package/docs/common.txt').content, 'common file\n');
            assert.strictEqual(getPublishedFile(publishedPackage, 'package/docs/first.txt').content, 'package file\n');
        })
    );
});
