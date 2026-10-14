import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { bindingAnalysis } from '../analyzed-bundle-fixtures.ts';
import { loadPackageManifest } from '../load-package-manifest.ts';
import { asImplicitExportsBundle } from '../modern-bundle.ts';

suite('no-superfluous-files', function () {
    test('ignores superfluous local files and reference node modules', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/superfluous-files');
        const result = await packageProcessor.build({
            name: 'the-package-name',
            version: '42.0.0',
            sourcesFolder: path.join(fixture, 'source'),
            roots: { main: { javaScript: path.join(fixture, 'source/entry.js') } },
            mainPackageManifest: await loadPackageManifest(fixture),
            includeSourceMapFiles: false,
            additionalFiles: [],
            bundleDependencies: [],
            bundlePeerDependencies: [],
            additionalPackageManifestAttributes: {},
            allowMutableSpecifiers: [],
            deadCodeElimination: { enabled: false }
        });

        assert.deepStrictEqual(
            result,
            asImplicitExportsBundle({
                additionalAttributes: {},
                packageManifest: {
                    name: 'the-package-name',
                    sideEffects: false,
                    type: 'module',
                    version: '42.0.0'
                },
                manifestFile: {
                    isExecutable: false,
                    content: '',
                    filePath: 'package.json'
                },
                contents: [
                    {
                        directDependencies: new Set([ path.join(fixture, 'source/foo.js') ]),
                        fileDescription: {
                            content: "import { foo } from './foo';\n",
                            inputFilePath: path.join(fixture, 'source/entry.js'),
                            isExecutable: false,
                            targetFilePath: 'entry.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('foo')
                    },
                    {
                        directDependencies: new Set(),
                        fileDescription: {
                            content: "export const foo = 'foo';\n",
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/foo.js'),
                            targetFilePath: 'foo.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('foo')
                    }
                ],
                dependencies: {},
                mainFile: {
                    content: "import { foo } from './foo';\n",
                    isExecutable: false,
                    inputFilePath: path.join(fixture, 'source/entry.js'),
                    targetFilePath: 'entry.js'
                },
                name: 'the-package-name',
                packageType: 'module',
                peerDependencies: {},
                sideEffectsField: false,
                version: '42.0.0',
                typesMainFile: undefined
            })
        );
    });
});
