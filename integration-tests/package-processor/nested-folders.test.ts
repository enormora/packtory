import path from 'node:path';
import test from 'ava';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.js';
import { loadPackageJson } from '../load-package-json.js';

test('resolves files in a nested folder structure correctly', async (t) => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/nested-folders');
    const result = await packageProcessor.build({
        name: 'the-package-name',
        version: '42.0.0',
        sourcesFolder: path.join(fixture, 'src'),
        entryPoints: [{ js: path.join(fixture, 'src/entry.js') }],
        mainPackageJson: await loadPackageJson(fixture),
        includeSourceMapFiles: false,
        additionalFiles: [],
        moduleResolution: 'module',
        bundleDependencies: [],
        bundlePeerDependencies: [],
        additionalPackageJsonAttributes: {}
    });

    t.deepEqual(result, {
        additionalAttributes: {},
        packageJson: {
            main: 'entry.js',
            name: 'the-package-name',
            version: '42.0.0'
        },
        manifestFile: {
            isExecutable: false,
            content: '{\n    "main": "entry.js",\n    "name": "the-package-name",\n    "version": "42.0.0"\n}',
            filePath: 'package.json'
        },
        contents: [
            {
                directDependencies: new Set([path.join(fixture, 'src/nested/foo.js')]),
                fileDescription: {
                    content: "import { foo } from './nested/foo.js';\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry.js'),
                    targetFilePath: 'entry.js'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([path.join(fixture, 'src/nested/deep/bar.js')]),
                fileDescription: {
                    content: "import { bar } from './deep/bar.js';\n\nexport const foo = 'foo';\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/nested/foo.js'),
                    targetFilePath: 'nested/foo.js'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([path.join(fixture, 'src/nested/deep/folder/baz.js')]),
                fileDescription: {
                    content: "import { baz } from './folder/baz.js';\n\nexport const bar = 'bar';\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/nested/deep/bar.js'),
                    targetFilePath: 'nested/deep/bar.js'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([]),
                fileDescription: {
                    content: "export const baz = 'baz';\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/nested/deep/folder/baz.js'),
                    targetFilePath: 'nested/deep/folder/baz.js'
                },
                isSubstituted: false
            }
        ],
        mainFile: {
            content: "import { foo } from './nested/foo.js';\n",
            isExecutable: false,
            sourceFilePath: path.join(fixture, 'src/entry.js'),
            targetFilePath: 'entry.js'
        },
        dependencies: {},
        packageType: undefined,
        peerDependencies: {},
        name: 'the-package-name',
        typesMainFile: undefined,
        version: '42.0.0'
    });
});
