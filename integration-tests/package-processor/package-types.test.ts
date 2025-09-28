import path from 'node:path';
import test from 'ava';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { loadPackageJson } from '../load-package-json.ts';

test('includes all required local files and references correct node modules but ignores builtin modules', async (t) => {
    const fixture = path.join(
        process.cwd(),
        'integration-tests/fixtures/with-local-builtin-and-node-module-dependencies'
    );
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
            dependencies: { 'example-module': '1.2.3' },
            main: 'entry.js',
            name: 'the-package-name',
            version: '42.0.0'
        },
        manifestFile: {
            isExecutable: false,
            content:
                '{\n    "dependencies": {\n        "example-module": "1.2.3"\n    },\n    "main": "entry.js",\n    "name": "the-package-name",\n    "version": "42.0.0"\n}',
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
                    content:
                        "import { bar } from './bar';\nimport path from 'node:path';\n\nexport const foo = 'foo';\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/foo.js'),
                    targetFilePath: 'foo.js'
                },
                isSubstituted: false
            },
            {
                directDependencies: new Set([]),
                fileDescription: {
                    content: "import { example } from 'example-module';\n\nexport const bar = 'bar';\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/bar.js'),
                    targetFilePath: 'bar.js'
                },
                isSubstituted: false
            }
        ],
        dependencies: {
            'example-module': '1.2.3'
        },
        mainFile: {
            content: "import { foo } from './foo';\n",
            isExecutable: false,
            sourceFilePath: path.join(fixture, 'src/entry.js'),
            targetFilePath: 'entry.js'
        },
        name: 'the-package-name',
        packageType: undefined,
        peerDependencies: {},
        typesMainFile: undefined,
        version: '42.0.0'
    });
});

test('includes peer dependencies correctly', async (t) => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/with-peer-dependencies');
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
            peerDependencies: { 'example-module': '1.2.3' },
            main: 'entry.js',
            name: 'the-package-name',
            version: '42.0.0'
        },
        manifestFile: {
            isExecutable: false,
            content:
                '{\n    "main": "entry.js",\n    "name": "the-package-name",\n    "peerDependencies": {\n        "example-module": "1.2.3"\n    },\n    "version": "42.0.0"\n}',
            filePath: 'package.json'
        },
        contents: [
            {
                directDependencies: new Set(),
                fileDescription: {
                    content: "import { example } from 'example-module';\nexport const foo = example;\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry.js'),
                    targetFilePath: 'entry.js'
                },
                isSubstituted: false
            }
        ],
        dependencies: {},
        mainFile: {
            content: "import { example } from 'example-module';\nexport const foo = example;\n",
            isExecutable: false,
            sourceFilePath: path.join(fixture, 'src/entry.js'),
            targetFilePath: 'entry.js'
        },
        name: 'the-package-name',
        packageType: undefined,
        peerDependencies: {
            'example-module': '1.2.3'
        },
        typesMainFile: undefined,
        version: '42.0.0'
    });
});
