import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { bindingAnalysis } from '../analyzed-bundle-fixtures.ts';
import { loadPackageJson } from '../load-package-json.ts';
import { asImplicitExportsBundle } from '../modern-bundle.ts';

suite('cyclic-dependencies', function () {
    test('correctly detects cyclic dependencies and avoids an infinite loop', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-esm-cyclic');
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
                    name: 'the-package-name',
                    sideEffects: false,
                    version: '42.0.0',
                    type: 'module'
                },
                manifestFile: {
                    isExecutable: false,
                    content: '',
                    filePath: 'package.json'
                },
                contents: [
                    {
                        directDependencies: new Set([ path.join(fixture, 'src/foo.js') ]),
                        fileDescription: {
                            content: "import { foo } from './foo';\n",
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/entry.js'),
                            targetFilePath: 'entry.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('foo')
                    },
                    {
                        directDependencies: new Set([ path.join(fixture, 'src/bar.js') ]),
                        fileDescription: {
                            content:
                                "import { bar } from './bar';\n\nexport const foo = 'foo';\nexport const foo2 = bar;\n",
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/foo.js'),
                            targetFilePath: 'foo.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('bar', 'foo', 'foo2')
                    },
                    {
                        directDependencies: new Set([ path.join(fixture, 'src/foo.js') ]),
                        fileDescription: {
                            content:
                                "import { foo } from './foo';\n\nexport const bar = 'bar';\nexport const bar2 = foo;\n",
                            isExecutable: false,
                            sourceFilePath: path.join(fixture, 'src/bar.js'),
                            targetFilePath: 'bar.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('foo', 'bar', 'bar2')
                    }
                ],
                dependencies: {},
                mainFile: {
                    content: "import { foo } from './foo';\n",
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
