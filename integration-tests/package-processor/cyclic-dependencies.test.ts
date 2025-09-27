import path from 'node:path';
import test from 'ava';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.js';
import { loadPackageJson } from '../load-package-json.js';

test('correctly detects cyclic dependencies and avoids an infinite loop', async (t) => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-esm-cyclic');
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
            version: '42.0.0',
            type: 'module'
        },
        manifestFile: {
            isExecutable: false,
            content:
                '{\n    "main": "entry.js",\n    "name": "the-package-name",\n    "type": "module",\n    "version": "42.0.0"\n}',
            filePath: 'package.json'
        },
        contents: [
            {
                directDependencies: new Set([path.join(fixture, 'src/foo.js')]),
                fileDescription: {
                    content: "import { foo } from './foo';\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry.js'),
                    targetFilePath: 'entry.js'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([path.join(fixture, 'src/bar.js')]),
                fileDescription: {
                    content: "import { bar } from './bar';\n\nexport const foo = 'foo';\nexport const foo2 = bar;\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/foo.js'),
                    targetFilePath: 'foo.js'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([path.join(fixture, 'src/foo.js')]),
                fileDescription: {
                    content: "import { foo } from './foo';\n\nexport const bar = 'bar';\nexport const bar2 = foo;\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/bar.js'),
                    targetFilePath: 'bar.js'
                },
                isSubstituted: false
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
        typesMainFile: undefined,
        version: '42.0.0'
    });
});
