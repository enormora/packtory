import path from 'node:path';
import assert from 'node:assert';
import { test } from 'mocha';
import npmFetch from 'npm-registry-fetch';
import { publish } from 'libnpmpublish';
import { loadPackageJson } from '../load-package-json.ts';
import { checkWithRegistry, type RegistryDetails } from '../registry.ts';
import { buildAndPublishAll, type PublishAllResult } from '../../source/packages/packtory/packtory.entry-point.ts';
import { createRegistryClient } from '../../source/bundle-emitter/registry-client.ts';
import { extractPackageTarball } from '../../source/bundle-emitter/extract-package-tarball.ts';

const registryClient = createRegistryClient({ npmFetch, publish });

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

async function publishPackagesFromFixtures(
    fixturePath: string,
    registryDetails: RegistryDetails
): Promise<PublishAllResult> {
    return buildAndPublishAll(
        {
            registrySettings: {
                registryUrl: registryDetails.registryUrl,
                token: registryDetails.token
            },
            commonPackageSettings: {
                sourcesFolder: path.join(fixturePath, 'src'),
                mainPackageJson: await loadPackageJson(fixturePath)
            },
            packages: [
                {
                    name: 'first',
                    entryPoints: [
                        {
                            js: path.join(fixturePath, 'src/entry1.js'),
                            declarationFile: path.join(fixturePath, 'src/entry1.d.ts')
                        }
                    ]
                },
                {
                    name: 'second',
                    entryPoints: [
                        {
                            js: path.join(fixturePath, 'src/entry2.js'),
                            declarationFile: path.join(fixturePath, 'src/entry2.d.ts')
                        }
                    ],
                    bundleDependencies: ['first']
                }
            ]
        },
        { dryRun: false }
    );
}

async function fetchLatestVersion(
    packageName: string,
    registryDetails: RegistryDetails
): Promise<Record<string, unknown>> {
    const versionDetails = await registryClient.fetchLatestVersion(packageName, registryDetails);
    if (versionDetails.isJust) {
        const { version, tarballUrl, shasum } = versionDetails.value;
        const tarballData = await registryClient.fetchTarball(tarballUrl, shasum);
        const files = await extractPackageTarball(tarballData);

        return {
            version,
            files
        };
    }

    return {};
}

async function assertFixturePublishResult(
    fixturePath: string,
    registryDetails: RegistryDetails,
    expectedSecondPackageVersion: Record<string, unknown>
): Promise<void> {
    const result = await publishPackagesFromFixtures(fixturePath, registryDetails);
    assert.strictEqual(result.isOk, true);

    const latestVersionOfFirstPackage = await fetchLatestVersion('first', registryDetails);
    const latestVersionOfSecondPackage = await fetchLatestVersion('second', registryDetails);

    assert.deepStrictEqual(latestVersionOfFirstPackage, expectedFirstPackageVersion);
    assert.deepStrictEqual(latestVersionOfSecondPackage, expectedSecondPackageVersion);
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
