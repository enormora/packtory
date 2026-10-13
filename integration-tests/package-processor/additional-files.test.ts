import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { bindingAnalysis, emptyAnalysis } from '../analyzed-bundle-fixtures.ts';
import { loadPackageManifest } from '../load-package-manifest.ts';
import { asImplicitExportsBundle } from '../modern-bundle.ts';

type BuiltPackage = Awaited<ReturnType<typeof packageProcessor.build>>;
type SharedAdditionalFileSubstitutionFixture = {
    readonly sourcesFolder: string;
    readonly licenseSourcePath: string;
    readonly mainPackageManifest: Awaited<ReturnType<typeof loadPackageManifest>>;
};

async function loadSharedAdditionalFileSubstitutionFixture(): Promise<SharedAdditionalFileSubstitutionFixture> {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/shared-additional-file-substitution');
    return {
        sourcesFolder: path.join(fixture, 'source'),
        licenseSourcePath: path.join(fixture, 'LICENSE'),
        mainPackageManifest: await loadPackageManifest(fixture)
    };
}

async function buildSharedLicensePackage(
    fixture: SharedAdditionalFileSubstitutionFixture,
    packageName: string,
    rootFileName: string,
    bundleDependencies: readonly BuiltPackage[]
): Promise<BuiltPackage> {
    return packageProcessor.build({
        name: packageName,
        version: '1.0.0',
        sourcesFolder: fixture.sourcesFolder,
        surface: { mode: 'explicit', packageInterface: { modules: [ { export: '.', root: 'main' } ] } },
        roots: { main: { javaScript: path.join(fixture.sourcesFolder, rootFileName) } },
        mainPackageManifest: fixture.mainPackageManifest,
        includeSourceMapFiles: false,
        additionalFiles: [ { inputFilePath: fixture.licenseSourcePath, targetFilePath: 'LICENSE' } ],
        bundleDependencies,
        bundlePeerDependencies: [],
        additionalPackageManifestAttributes: {},
        allowMutableSpecifiers: [],
        deadCodeElimination: { enabled: false }
    });
}

suite('additional-files', function () {
    test('includes additional files in the bundle contents', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/additional-files');
        const additionalFileSourcePath = path.join(fixture, 'documentation/additional-information.txt');

        const result = await packageProcessor.build({
            name: 'additional-files-package',
            version: '1.0.0',
            sourcesFolder: path.join(fixture, 'source'),
            roots: { main: { javaScript: path.join(fixture, 'source/entry.js') } },
            mainPackageManifest: await loadPackageManifest(fixture),
            includeSourceMapFiles: false,
            additionalFiles: [
                {
                    inputFilePath: additionalFileSourcePath,
                    targetFilePath: 'documentation/additional-information.txt'
                }
            ],
            bundleDependencies: [],
            bundlePeerDependencies: [],
            additionalPackageManifestAttributes: {},
            allowMutableSpecifiers: []
        });

        assert.deepStrictEqual(
            result,
            asImplicitExportsBundle({
                additionalAttributes: {},
                packageManifest: {
                    name: 'additional-files-package',
                    sideEffects: false,
                    type: 'module',
                    version: '1.0.0'
                },
                manifestFile: {
                    isExecutable: false,
                    content: '',
                    filePath: 'package.json'
                },
                contents: [
                    {
                        directDependencies: new Set([ path.join(fixture, 'source/greeting.js') ]),
                        fileDescription: {
                            content:
                                "import { greeting } from './greeting.js';\n\nexport function run() {\n    return greeting();\n}\n",
                            inputFilePath: path.join(fixture, 'source/entry.js'),
                            isExecutable: false,
                            targetFilePath: 'entry.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('greeting', 'run')
                    },
                    {
                        directDependencies: new Set(),
                        fileDescription: {
                            content: "export function greeting() {\n    return 'hello from src';\n}\n",
                            inputFilePath: path.join(fixture, 'source/greeting.js'),
                            isExecutable: false,
                            targetFilePath: 'greeting.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('greeting')
                    },
                    {
                        directDependencies: new Set(),
                        fileDescription: {
                            content: 'This file should be included in the bundle.\n',
                            inputFilePath: additionalFileSourcePath,
                            isExecutable: false,
                            targetFilePath: 'documentation/additional-information.txt'
                        },
                        isExplicitlyIncluded: true,
                        isSubstituted: false,
                        analysis: emptyAnalysis
                    }
                ],
                dependencies: {},
                mainFile: {
                    content:
                        "import { greeting } from './greeting.js';\n\nexport function run() {\n    return greeting();\n}\n",
                    isExecutable: false,
                    inputFilePath: path.join(fixture, 'source/entry.js'),
                    targetFilePath: 'entry.js'
                },
                name: 'additional-files-package',
                packageType: 'module',
                peerDependencies: {},
                sideEffectsField: false,
                version: '1.0.0',
                typesMainFile: undefined
            })
        );
    });

    test('rejects additional files that target the generated package manifest', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/additional-files');

        await assert.rejects(
            packageProcessor.build({
                name: 'additional-files-package',
                version: '1.0.0',
                sourcesFolder: path.join(fixture, 'source'),
                roots: { main: { javaScript: path.join(fixture, 'source/entry.js') } },
                mainPackageManifest: await loadPackageManifest(fixture),
                includeSourceMapFiles: false,
                additionalFiles: [
                    {
                        inputFilePath: path.join(fixture, 'documentation/additional-information.txt'),
                        targetFilePath: 'package.json'
                    }
                ],
                bundleDependencies: [],
                bundlePeerDependencies: [],
                additionalPackageManifestAttributes: {},
                allowMutableSpecifiers: []
            }),
            {
                message: 'additionalFiles must not target generated package manifest "package.json".'
            }
        );
    });

    test('keeps shared additional files and private bundle dependency sources', async function () {
        const fixture = await loadSharedAdditionalFileSubstitutionFixture();
        const producerBundle = await buildSharedLicensePackage(fixture, 'producer', 'producer.js', []);
        const consumerBundle = await buildSharedLicensePackage(fixture, 'consumer', 'consumer.js', [ producerBundle ]);
        const consumerLicense = consumerBundle.contents.find(function (content) {
            return content.fileDescription.targetFilePath === 'LICENSE';
        });
        const retainedSharedSource = consumerBundle.contents.find(function (content) {
            return content.fileDescription.inputFilePath === path.join(fixture.sourcesFolder, 'shared.js');
        });

        assert.notStrictEqual(consumerLicense, undefined);
        assert.partialDeepStrictEqual(consumerLicense, {
            fileDescription: {
                content: 'Shared license text.\n',
                isExecutable: false,
                inputFilePath: fixture.licenseSourcePath,
                targetFilePath: 'LICENSE'
            },
            isExplicitlyIncluded: true
        });
        assert.partialDeepStrictEqual(retainedSharedSource, {
            fileDescription: {
                content: "export const sharedValue = 'shared';\n",
                targetFilePath: 'shared.js'
            },
            isSubstituted: false
        });
    });
});
