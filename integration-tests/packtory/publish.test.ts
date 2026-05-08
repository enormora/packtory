import path from 'node:path';
import assert from 'node:assert';
import { test } from 'mocha';
import npmFetch from 'npm-registry-fetch';
import { publish } from 'libnpmpublish';
import { loadPackageJson } from '../load-package-json.ts';
import { checkWithRegistry, type RegistryDetails } from '../registry.ts';
import {
    buildAndPublishAll,
    type PacktoryConfig,
    type PublishAllResult
} from '../../source/packages/packtory/packtory.entry-point.ts';
import { createRegistryClient } from '../../source/bundle-emitter/registry-client.ts';
import { extractPackageTarball } from '../../source/bundle-emitter/extract-package-tarball.ts';

const timers = process.getBuiltinModule('node:timers');

const registryClient = createRegistryClient({
    npmFetch,
    publish,
    fetch: globalThis.fetch,
    clock: {
        getCurrentTimeInMilliseconds: () => {
            return Date.now();
        },
        setTimeout: timers.setTimeout,
        clearTimeout: timers.clearTimeout
    },
    resolveIdToken: async () => {
        throw new Error('OIDC id tokens are not used in this integration test');
    }
});

type PublishedFile = Awaited<ReturnType<typeof extractPackageTarball>>[number];

type PublishedPackage = {
    readonly version: string;
    readonly files: readonly PublishedFile[];
    readonly manifest: Record<string, unknown>;
};

type PackageConfig = PacktoryConfig['packages'][number];
type PackageConfigList = readonly [PackageConfig, ...(readonly PackageConfig[])];
type CommonPackageSettings = NonNullable<PacktoryConfig['commonPackageSettings']>;
type PublishConfig = PacktoryConfig & {
    readonly commonPackageSettings: CommonPackageSettings & {
        readonly sourcesFolder: string;
        readonly mainPackageJson: NonNullable<CommonPackageSettings['mainPackageJson']>;
    };
};
type CreatePublishConfigParams = {
    readonly fixturePath: string;
    readonly registryDetails: RegistryDetails;
    readonly packages: PackageConfigList;
    readonly commonPackageSettings?: Partial<CommonPackageSettings>;
    readonly mainPackageJsonOverrides?: Partial<NonNullable<CommonPackageSettings['mainPackageJson']>>;
};
type PublishFixturePackagesParams = {
    readonly fixturePath: string;
    readonly registryDetails: RegistryDetails;
    readonly packages?: PackageConfigList;
    readonly commonPackageSettings?: Partial<CommonPackageSettings>;
    readonly authMode?: 'basic' | 'bearer';
    readonly mainPackageJsonOverrides?: Partial<NonNullable<CommonPackageSettings['mainPackageJson']>>;
};

function createRegistrySettings(
    registryDetails: RegistryDetails,
    authMode: PublishFixturePackagesParams['authMode'] = 'bearer'
): PublishConfig['registrySettings'] {
    if (authMode === 'basic') {
        return {
            registryUrl: registryDetails.registryUrl,
            auth: {
                type: 'basic',
                username: registryDetails.username,
                password: registryDetails.password
            }
        };
    }

    return {
        registryUrl: registryDetails.registryUrl,
        auth: {
            type: 'bearer-token',
            token: registryDetails.token
        }
    };
}

const expectedFirstPackageVersion = {
    version: '0.0.1',
    files: [
        {
            isExecutable: false,
            content:
                '{\n    "main": "entry1.js",\n    "name": "first",\n    "type": "module",\n    "types": "entry1.d.ts",\n    "version": "0.0.1"\n}',
            filePath: 'package/package.json'
        },
        {
            isExecutable: false,
            content: "import { qux } from './qux.js';\n//# sourceMappingURL=entry1.js.map\n",
            filePath: 'package/entry1.js'
        },
        {
            isExecutable: false,
            content: "export const qux = 'qux';\n//# sourceMappingURL=qux.js.map\n",
            filePath: 'package/qux.js'
        },
        {
            isExecutable: false,
            content: "export declare const foo: import('./foo.js').Foo;\n",
            filePath: 'package/entry1.d.ts'
        },
        {
            isExecutable: false,
            content: "import { Baz } from './baz.js';\nexport type Foo = string;\n",
            filePath: 'package/foo.d.ts'
        },
        {
            isExecutable: false,
            content: 'export type Baz = number;\n',
            filePath: 'package/baz.d.ts'
        }
    ]
} as const;

const expectedSecondPackageFirstRunVersion = {
    version: '0.0.1',
    files: [
        {
            isExecutable: false,
            content:
                '{\n    "dependencies": {\n        "first": "0.0.1"\n    },\n    "main": "entry2.js",\n    "name": "second",\n    "type": "module",\n    "types": "entry2.d.ts",\n    "version": "0.0.1"\n}',
            filePath: 'package/package.json'
        },
        {
            isExecutable: false,
            content: "import { bar } from './bar.js';\n//# sourceMappingURL=entry2.js.map\n",
            filePath: 'package/entry2.js'
        },
        {
            isExecutable: false,
            content:
                "import { qux } from 'first/qux.js';\nexport const bar = 'bar';\n//# sourceMappingURL=bar.js.map\n",
            filePath: 'package/bar.js'
        },
        {
            isExecutable: false,
            content: "export declare const foo: import('first/foo.js').Foo;\n",
            filePath: 'package/entry2.d.ts'
        }
    ]
} as const;

const expectedSecondPackageSecondRunVersion = {
    version: '0.0.2',
    files: [
        {
            isExecutable: false,
            content:
                '{\n    "dependencies": {\n        "first": "0.0.1"\n    },\n    "main": "entry2.js",\n    "name": "second",\n    "type": "module",\n    "types": "entry2.d.ts",\n    "version": "0.0.2"\n}',
            filePath: 'package/package.json'
        },
        {
            isExecutable: false,
            content: "import { bar } from './bar.js';\n//# sourceMappingURL=entry2.js.map\n",
            filePath: 'package/entry2.js'
        },
        {
            isExecutable: false,
            content:
                "import { qux } from 'first/qux.js';\nexport const bar = 'bar-changed';\n//# sourceMappingURL=bar.js.map\n",
            filePath: 'package/bar.js'
        },
        {
            isExecutable: false,
            content: "export declare const foo: import('first/foo.js').Foo;\n",
            filePath: 'package/entry2.d.ts'
        }
    ]
} as const;

function createEntryPoint(
    fixturePath: string,
    entryBaseName: string
): NonNullable<PackageConfig['entryPoints']>[number] {
    return {
        js: path.join(fixturePath, `src/${entryBaseName}.js`),
        declarationFile: path.join(fixturePath, `src/${entryBaseName}.d.ts`)
    };
}

function createPackageConfig(
    fixturePath: string,
    name: string,
    entryBaseName: string,
    overrides: Partial<PackageConfig> = {}
): PackageConfig {
    return {
        name,
        entryPoints: [createEntryPoint(fixturePath, entryBaseName)],
        ...overrides
    };
}

function createPackageConfigList<TFirst extends PackageConfig, TRest extends readonly PackageConfig[]>(
    first: TFirst,
    ...rest: TRest
): readonly [TFirst, ...TRest] {
    return [first, ...rest];
}

function createStandardPackages(fixturePath: string): PackageConfigList {
    return createPackageConfigList(
        createPackageConfig(fixturePath, 'first', 'entry1'),
        createPackageConfig(fixturePath, 'second', 'entry2', { bundleDependencies: ['first'] })
    );
}

async function createPublishConfig(params: CreatePublishConfigParams): Promise<PublishConfig> {
    const { fixturePath, registryDetails, packages, commonPackageSettings, mainPackageJsonOverrides } = params;
    const baseMainPackageJson = await loadPackageJson(fixturePath);
    const mergedMainPackageJson = { ...baseMainPackageJson, ...mainPackageJsonOverrides };
    const mergedCommonPackageSettings: PublishConfig['commonPackageSettings'] = {
        publishSettings: { access: 'public', sbom: { enabled: false } },
        ...commonPackageSettings,
        sourcesFolder: path.join(fixturePath, 'src'),
        mainPackageJson: mergedMainPackageJson
    };

    return {
        registrySettings: createRegistrySettings(registryDetails),
        commonPackageSettings: mergedCommonPackageSettings,
        packages
    };
}

async function publishFixturePackages(params: PublishFixturePackagesParams): Promise<PublishAllResult> {
    const configParams = {
        fixturePath: params.fixturePath,
        registryDetails: params.registryDetails,
        packages: params.packages ?? createStandardPackages(params.fixturePath),
        ...(params.commonPackageSettings === undefined ? {} : { commonPackageSettings: params.commonPackageSettings }),
        ...(params.mainPackageJsonOverrides === undefined
            ? {}
            : { mainPackageJsonOverrides: params.mainPackageJsonOverrides })
    };
    const config = await createPublishConfig(configParams);
    const registrySettings = createRegistrySettings(params.registryDetails, params.authMode);

    return buildAndPublishAll({ ...config, registrySettings }, { dryRun: false });
}

function assertPublishSucceeded(result: PublishAllResult): void {
    assert.strictEqual(result.isOk, true);
}

async function fetchPublishedPackage(packageName: string, registryDetails: RegistryDetails): Promise<PublishedPackage> {
    const registrySettings = createRegistrySettings(registryDetails);
    const versionDetails = await registryClient.fetchLatestVersion(packageName, registrySettings);

    if (versionDetails.isNothing) {
        assert.fail(`Expected package "${packageName}" to be published`);
    }

    const { version, tarballUrl, shasum } = versionDetails.value;
    const tarballData = await registryClient.fetchTarball(tarballUrl, shasum, registrySettings);
    const files = await extractPackageTarball(tarballData);
    const manifestFile = files.find((file) => {
        return file.filePath === 'package/package.json';
    });

    if (manifestFile === undefined) {
        assert.fail(`Expected tarball for "${packageName}" to contain package/package.json`);
    }

    return {
        version,
        files,
        manifest: JSON.parse(manifestFile.content) as Record<string, unknown>
    };
}

function getPublishedFile(publishedPackage: PublishedPackage, filePath: string): PublishedFile {
    const file = publishedPackage.files.find((entry) => {
        return entry.filePath === filePath;
    });

    if (file === undefined) {
        assert.fail(`Expected published package to contain "${filePath}"`);
    }

    return file;
}

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

test(
    'publishes the initial version of two packages in the first run and updates one of the two packages in the second run because the other did not change',
    checkWithRegistry(async (registryDetails) => {
        const firstRunFixture = path.join(
            process.cwd(),
            'integration-tests/fixtures/multiple-packages-with-substitution'
        );
        await assertFixturePublishResult(firstRunFixture, registryDetails, expectedSecondPackageFirstRunVersion);

        const secondRunFixture = path.join(
            process.cwd(),
            'integration-tests/fixtures/multiple-packages-with-substitution-slightly-modified'
        );
        await assertFixturePublishResult(secondRunFixture, registryDetails, expectedSecondPackageSecondRunVersion);
    })
);

test(
    'does not publish a new version when the same bundle is published twice unchanged',
    checkWithRegistry(async (registryDetails) => {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/multiple-packages-with-substitution');

        assertPublishSucceeded(await publishFixturePackages({ fixturePath, registryDetails }));
        assertPublishSucceeded(await publishFixturePackages({ fixturePath, registryDetails }));

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
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/multiple-packages-with-substitution');
        const packages = createPackageConfigList(
            createPackageConfig(fixturePath, 'first', 'entry1', {
                versioning: { automatic: false, version: '3.2.1' }
            })
        );

        assertPublishSucceeded(await publishFixturePackages({ fixturePath, registryDetails, packages }));
        assertPublishSucceeded(await publishFixturePackages({ fixturePath, registryDetails, packages }));

        const publishedPackage = await fetchPublishedPackage('first', registryDetails);

        assert.strictEqual(publishedPackage.version, '3.2.1');
        assert.strictEqual(publishedPackage.manifest.version, '3.2.1');
    })
);

test(
    'publishes successfully with explicit basic auth against the registry',
    checkWithRegistry(async (registryDetails) => {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/multiple-packages-with-substitution');
        const packages = createPackageConfigList(createPackageConfig(fixturePath, 'first', 'entry1'));

        assertPublishSucceeded(
            await publishFixturePackages({ fixturePath, registryDetails, packages, authMode: 'basic' })
        );

        const publishedPackage = await fetchPublishedPackage('first', registryDetails);

        assert.strictEqual(publishedPackage.version, '0.0.1');
        assert.strictEqual(publishedPackage.manifest.version, '0.0.1');
    })
);

test(
    'publishes the configured minimumVersion for the first automatic publish',
    checkWithRegistry(async (registryDetails) => {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/multiple-packages-with-substitution');
        const packages = createPackageConfigList(
            createPackageConfig(fixturePath, 'first', 'entry1', {
                versioning: { automatic: true, minimumVersion: '1.2.3' }
            })
        );

        assertPublishSucceeded(await publishFixturePackages({ fixturePath, registryDetails, packages }));

        const publishedPackage = await fetchPublishedPackage('first', registryDetails);

        assert.strictEqual(publishedPackage.version, '1.2.3');
        assert.strictEqual(publishedPackage.manifest.version, '1.2.3');
    })
);

test(
    'publishes bundle peer dependencies into peerDependencies and keeps the substituted imports',
    checkWithRegistry(async (registryDetails) => {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/multiple-packages-with-substitution');
        const packages = createPackageConfigList(
            createPackageConfig(fixturePath, 'first', 'entry1'),
            createPackageConfig(fixturePath, 'second', 'entry2', { bundleDependencies: ['first'] }),
            createPackageConfig(fixturePath, 'third', 'entry3', {
                bundleDependencies: ['first'],
                bundlePeerDependencies: ['second']
            })
        );

        assertPublishSucceeded(await publishFixturePackages({ fixturePath, registryDetails, packages }));

        const publishedPackage = await fetchPublishedPackage('third', registryDetails);

        assert.deepStrictEqual(publishedPackage.manifest.dependencies, { first: '0.0.1' });
        assert.deepStrictEqual(publishedPackage.manifest.peerDependencies, { second: '0.0.1' });
        assert.strictEqual(
            getPublishedFile(publishedPackage, 'package/foo.js').content,
            "import { bar } from 'second/bar.js';\nexport const foo = 'foo';\n//# sourceMappingURL=foo.js.map\n"
        );
        assert.strictEqual(
            getPublishedFile(publishedPackage, 'package/entry3.d.ts').content,
            "export declare const foo: import('first/foo.js').Foo;\n"
        );
    })
);

test(
    'includes a CycloneDX SBOM next to the manifest when SBOM is enabled',
    checkWithRegistry(async (registryDetails) => {
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/multiple-packages-with-substitution');
        const packages = createPackageConfigList(
            createPackageConfig(fixturePath, 'first', 'entry1', {
                publishSettings: { access: 'public', sbom: { enabled: true } }
            }),
            createPackageConfig(fixturePath, 'second', 'entry2', {
                bundleDependencies: ['first'],
                publishSettings: { access: 'public', sbom: { enabled: true } }
            })
        );

        assertPublishSucceeded(await publishFixturePackages({ fixturePath, registryDetails, packages }));

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
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/multiple-packages-with-substitution');
        const packages = createPackageConfigList(
            createPackageConfig(fixturePath, 'first', 'entry1', {
                publishSettings: { access: 'public', sbom: { enabled: true } }
            }),
            createPackageConfig(fixturePath, 'second', 'entry2', {
                bundleDependencies: ['first'],
                publishSettings: { access: 'public', sbom: { enabled: true } }
            })
        );

        assertPublishSucceeded(await publishFixturePackages({ fixturePath, registryDetails, packages }));

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
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/multiple-packages-with-substitution');
        const packages = createPackageConfigList(
            createPackageConfig(fixturePath, 'first', 'entry1', {
                publishSettings: { access: 'public', sbom: { enabled: true } }
            })
        );

        assertPublishSucceeded(await publishFixturePackages({ fixturePath, registryDetails, packages }));
        const firstRun = await fetchPublishedPackage('first', registryDetails);

        assertPublishSucceeded(await publishFixturePackages({ fixturePath, registryDetails, packages }));
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
        const fixturePath = path.join(
            process.cwd(),
            'integration-tests/fixtures/with-local-builtin-and-node-module-dependencies'
        );
        const packages = createPackageConfigList({
            name: 'mutable-rejection-fixture',
            entryPoints: [{ js: path.join(fixturePath, 'src/entry.js') }]
        });

        const result = await publishFixturePackages({
            fixturePath,
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

        const versionDetails = await registryClient.fetchLatestVersion(
            'mutable-rejection-fixture',
            createRegistrySettings(registryDetails)
        );
        assert.strictEqual(versionDetails.isNothing, true);
    })
);

test(
    'allows a mutable git+https specifier when the dep is allow-listed and preserves it in the published manifest',
    checkWithRegistry(async (registryDetails) => {
        const fixturePath = path.join(
            process.cwd(),
            'integration-tests/fixtures/with-local-builtin-and-node-module-dependencies'
        );
        const packages = createPackageConfigList({
            name: 'mutable-allow-list-fixture',
            entryPoints: [{ js: path.join(fixturePath, 'src/entry.js') }]
        });

        assertPublishSucceeded(
            await publishFixturePackages({
                fixturePath,
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
        const fixturePath = path.join(process.cwd(), 'integration-tests/fixtures/multiple-packages-with-substitution');
        const packages = createPackageConfigList(
            createPackageConfig(fixturePath, 'first', 'entry1', {
                additionalFiles: [
                    {
                        sourceFilePath: path.join(fixturePath, 'docs/first.txt'),
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
                fixturePath,
                registryDetails,
                packages,
                commonPackageSettings: {
                    includeSourceMapFiles: true,
                    additionalFiles: [
                        {
                            sourceFilePath: path.join(fixturePath, 'docs/common.txt'),
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
