import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { bindingAnalysis } from '../analyzed-bundle-fixtures.ts';
import { loadPackageJson } from '../load-package-json.ts';
import { asImplicitExportsBundle } from '../modern-bundle.ts';

suite('exports-only-js-dependency', function () {
    test('records the dependency when a node_modules package declares only an "import" condition under exports', async function () {
        const fixture = path.join(
            process.cwd(),
            'integration-tests/fixtures/with-exports-only-js-node-module-dependency'
        );
        const result = await packageProcessor.build({
            name: 'the-package-name',
            version: '42.0.0',
            sourcesFolder: path.join(fixture, 'src'),
            roots: { main: { js: path.join(fixture, 'src/entry.js') } },
            mainPackageJson: await loadPackageJson(fixture),
            includeSourceMapFiles: false,
            additionalFiles: [],
            bundleDependencies: [],
            bundlePeerDependencies: [],
            additionalPackageJsonAttributes: {},
            allowMutableSpecifiers: [],
            deadCodeElimination: { enabled: false }
        });

        assert.deepStrictEqual(
            result,
            asImplicitExportsBundle({
                additionalAttributes: {},
                packageJson: {
                    dependencies: { 'exports-only-module': '1.2.3' },
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
                        directDependencies: new Set(),
                        fileDescription: {
                            content: "import { example } from 'exports-only-module';\n\nexport const foo = example;\n",
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/entry.js'),
                            targetFilePath: 'entry.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('example', 'foo')
                    }
                ],
                dependencies: {
                    'exports-only-module': '1.2.3'
                },
                mainFile: {
                    content: "import { example } from 'exports-only-module';\n\nexport const foo = example;\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry.js'),
                    targetFilePath: 'entry.js'
                },
                name: 'the-package-name',
                packageType: 'module',
                peerDependencies: {},
                sideEffectsField: false,
                typesMainFile: undefined,
                version: '42.0.0'
            })
        );
    });
});
