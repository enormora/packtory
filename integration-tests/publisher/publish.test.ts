import path from 'node:path';
import test from 'ava';
import npmFetch from 'npm-registry-fetch';
import { publish } from 'libnpmpublish';
import { loadPackageJson } from '../load-package-json.js';
import { checkWithRegistry, type RegistryDetails } from '../registry.js';
import { buildAndPublishAll, type PublishAllResult } from '../../source/packages/packtory/packtory.entry-point.js';
import { createRegistryClient } from '../../source/publisher/registry-client.js';
// eslint-disable-next-line import/max-dependencies -- maybe we can extract some of the setup functions to bundle dependencies
import { extractPackageTarball } from '../../source/publisher/extract-package-tarball.js';

const registryClient = createRegistryClient({ npmFetch, publish });

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

test(
    'publishes the initial version of two packages in the first run and updates one of the two packages in the second run because the other did not change',
    checkWithRegistry,
    // eslint-disable-next-line max-statements -- no idea how to make this smaller
    async (t, registryDetails) => {
        const firstRunFixture = path.join(
            process.cwd(),
            'integration-tests/fixtures/multiple-packages-with-substitution'
        );

        const result = await publishPackagesFromFixtures(firstRunFixture, registryDetails);
        t.is(result.isOk, true);

        const latestVersionOfFirstPackage = await fetchLatestVersion('first', registryDetails);
        const latestVersionOfSecondPackage = await fetchLatestVersion('second', registryDetails);

        t.deepEqual(latestVersionOfFirstPackage, {
            version: '0.0.1',
            files: [
                {
                    content:
                        '{\n    "dependencies": {},\n    "main": "entry1.js",\n    "name": "first",\n    "type": "module",\n    "types": "entry1.d.ts",\n    "version": "0.0.1"\n}',
                    filePath: 'package/package.json'
                },
                {
                    content: "import { qux } from './qux.js';\n//# sourceMappingURL=entry1.js.map\n",
                    filePath: 'package/entry1.js'
                },
                {
                    content: "export const qux = 'qux';\n//# sourceMappingURL=qux.js.map\n",
                    filePath: 'package/qux.js'
                },
                {
                    content: "export declare const foo: import('./foo.js').Foo;\n",
                    filePath: 'package/entry1.d.ts'
                },
                {
                    content: "import { Baz } from './baz.js';\nexport type Foo = string;\n",
                    filePath: 'package/foo.d.ts'
                },
                {
                    content: 'export type Baz = number;\n',
                    filePath: 'package/baz.d.ts'
                }
            ]
        });
        t.deepEqual(latestVersionOfSecondPackage, {
            version: '0.0.1',
            files: [
                {
                    content:
                        '{\n    "dependencies": {\n        "first": "0.0.1"\n    },\n    "main": "entry2.js",\n    "name": "second",\n    "type": "module",\n    "types": "entry2.d.ts",\n    "version": "0.0.1"\n}',
                    filePath: 'package/package.json'
                },
                {
                    content: "import { bar } from './bar.js';\n//# sourceMappingURL=entry2.js.map\n",
                    filePath: 'package/entry2.js'
                },
                {
                    content:
                        "import { qux } from 'first/qux.js';\nexport const bar = 'bar';\n//# sourceMappingURL=bar.js.map\n",
                    filePath: 'package/bar.js'
                },
                {
                    content: "export declare const foo: import('first/foo.d.ts').Foo;\n",
                    filePath: 'package/entry2.d.ts'
                }
            ]
        });

        const secondRunFixture = path.join(
            process.cwd(),
            'integration-tests/fixtures/multiple-packages-with-substitution-slightly-modified'
        );

        const secondRunResult = await publishPackagesFromFixtures(secondRunFixture, registryDetails);
        t.is(secondRunResult.isOk, true);

        const latestVersionOfFirstPackageSecondRun = await fetchLatestVersion('first', registryDetails);
        const latestVersionOfSecondPackageSecondRun = await fetchLatestVersion('second', registryDetails);

        t.deepEqual(latestVersionOfFirstPackageSecondRun, {
            version: '0.0.1',
            files: [
                {
                    content:
                        '{\n    "dependencies": {},\n    "main": "entry1.js",\n    "name": "first",\n    "type": "module",\n    "types": "entry1.d.ts",\n    "version": "0.0.1"\n}',
                    filePath: 'package/package.json'
                },
                {
                    content: "import { qux } from './qux.js';\n//# sourceMappingURL=entry1.js.map\n",
                    filePath: 'package/entry1.js'
                },
                {
                    content: "export const qux = 'qux';\n//# sourceMappingURL=qux.js.map\n",
                    filePath: 'package/qux.js'
                },
                {
                    content: "export declare const foo: import('./foo.js').Foo;\n",
                    filePath: 'package/entry1.d.ts'
                },
                {
                    content: "import { Baz } from './baz.js';\nexport type Foo = string;\n",
                    filePath: 'package/foo.d.ts'
                },
                {
                    content: 'export type Baz = number;\n',
                    filePath: 'package/baz.d.ts'
                }
            ]
        });
        t.deepEqual(latestVersionOfSecondPackageSecondRun, {
            version: '0.0.2',
            files: [
                {
                    content:
                        '{\n    "dependencies": {\n        "first": "0.0.1"\n    },\n    "main": "entry2.js",\n    "name": "second",\n    "type": "module",\n    "types": "entry2.d.ts",\n    "version": "0.0.2"\n}',
                    filePath: 'package/package.json'
                },
                {
                    content: "import { bar } from './bar.js';\n//# sourceMappingURL=entry2.js.map\n",
                    filePath: 'package/entry2.js'
                },
                {
                    content:
                        "import { qux } from 'first/qux.js';\nexport const bar = 'bar-changed';\n//# sourceMappingURL=bar.js.map\n",
                    filePath: 'package/bar.js'
                },
                {
                    content: "export declare const foo: import('first/foo.d.ts').Foo;\n",
                    filePath: 'package/entry2.d.ts'
                }
            ]
        });
    }
);
