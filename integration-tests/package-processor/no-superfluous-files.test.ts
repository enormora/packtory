import path from 'node:path';
import assert from 'node:assert';
import { test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { bindingAnalysis } from '../analyzed-bundle-fixtures.ts';
import { loadPackageJson } from '../load-package-json.ts';
import { asImplicitExportsBundle } from '../modern-bundle.ts';

test('ignores superfluous local files and reference node modules', async () => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/superfluous-files');
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
                    directDependencies: new Set([path.join(fixture, 'src/foo.js')]),
                    fileDescription: {
                        content: "import { foo } from './foo';\n",
                        sourceFilePath: path.join(fixture, 'src/entry.js'),
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
                        sourceFilePath: path.join(fixture, 'src/foo.js'),
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
                sourceFilePath: path.join(fixture, 'src/entry.js'),
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
