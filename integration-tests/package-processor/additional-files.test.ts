import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { bindingAnalysis, emptyAnalysis } from '../analyzed-bundle-fixtures.ts';
import { loadPackageJson } from '../load-package-json.ts';
import { asImplicitExportsBundle } from '../modern-bundle.ts';

type BuiltPackage = Awaited<ReturnType<typeof packageProcessor.build>>;
type SharedAdditionalFileSubstitutionFixture = {
    readonly sourcesFolder: string;
    readonly licenseSourcePath: string;
    readonly mainPackageJson: Awaited<ReturnType<typeof loadPackageJson>>;
};

async function loadSharedAdditionalFileSubstitutionFixture(): Promise<SharedAdditionalFileSubstitutionFixture> {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/shared-additional-file-substitution');
    return {
        sourcesFolder: path.join(fixture, 'src'),
        licenseSourcePath: path.join(fixture, 'LICENSE'),
        mainPackageJson: await loadPackageJson(fixture)
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
        roots: { main: { js: path.join(fixture.sourcesFolder, rootFileName) } },
        mainPackageJson: fixture.mainPackageJson,
        includeSourceMapFiles: false,
        additionalFiles: [ { sourceFilePath: fixture.licenseSourcePath, targetFilePath: 'LICENSE' } ],
        bundleDependencies,
        bundlePeerDependencies: [],
        additionalPackageJsonAttributes: {},
        allowMutableSpecifiers: [],
        deadCodeElimination: { enabled: false }
    });
}

suite('additional-files', function () {
    test('includes additional files in the bundle contents', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/additional-files');
        const additionalFileSourcePath = path.join(fixture, 'docs/additional-info.txt');

        const result = await packageProcessor.build({
            name: 'additional-files-package',
            version: '1.0.0',
            sourcesFolder: path.join(fixture, 'src'),
            roots: { main: { js: path.join(fixture, 'src/entry.js') } },
            mainPackageJson: await loadPackageJson(fixture),
            includeSourceMapFiles: false,
            additionalFiles: [
                {
                    sourceFilePath: additionalFileSourcePath,
                    targetFilePath: 'docs/additional-info.txt'
                }
            ],
            bundleDependencies: [],
            bundlePeerDependencies: [],
            additionalPackageJsonAttributes: {},
            allowMutableSpecifiers: []
        });

        assert.deepStrictEqual(
            result,
            asImplicitExportsBundle({
                additionalAttributes: {},
                packageJson: {
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
                        directDependencies: new Set([ path.join(fixture, 'src/greeting.js') ]),
                        fileDescription: {
                            content:
                                "import { greeting } from './greeting.js';\n\nexport function run() {\n    return greeting();\n}\n",
                            sourceFilePath: path.join(fixture, 'src/entry.js'),
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
                            sourceFilePath: path.join(fixture, 'src/greeting.js'),
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
                            sourceFilePath: additionalFileSourcePath,
                            isExecutable: false,
                            targetFilePath: 'docs/additional-info.txt'
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
                    sourceFilePath: path.join(fixture, 'src/entry.js'),
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

    test('keeps shared additional files when another package substitutes bundle dependency sources', async function () {
        const fixture = await loadSharedAdditionalFileSubstitutionFixture();
        const producerBundle = await buildSharedLicensePackage(fixture, 'producer', 'producer.js', []);
        const consumerBundle = await buildSharedLicensePackage(fixture, 'consumer', 'consumer.js', [ producerBundle ]);
        const consumerLicense = consumerBundle.contents.find(function (content) {
            return content.fileDescription.targetFilePath === 'LICENSE';
        });
        const substitutedSharedSource = consumerBundle.contents.find(function (content) {
            return content.fileDescription.sourceFilePath === path.join(fixture.sourcesFolder, 'shared.js');
        });

        assert.notStrictEqual(consumerLicense, undefined);
        assert.partialDeepStrictEqual(consumerLicense, {
            fileDescription: {
                content: 'Shared license text.\n',
                isExecutable: false,
                sourceFilePath: fixture.licenseSourcePath,
                targetFilePath: 'LICENSE'
            },
            isExplicitlyIncluded: true
        });
        assert.strictEqual(substitutedSharedSource, undefined);
    });
});
