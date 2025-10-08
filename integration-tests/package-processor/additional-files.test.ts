import path from 'node:path';
import test from 'ava';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { loadPackageJson } from '../load-package-json.ts';

test('includes additional files in the bundle contents', async (t) => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/additional-files');
    const additionalFileSourcePath = path.join(fixture, 'docs/additional-info.txt');

    const result = await packageProcessor.build({
        name: 'additional-files-package',
        version: '1.0.0',
        sourcesFolder: path.join(fixture, 'src'),
        entryPoints: [{ js: path.join(fixture, 'src/entry.js') }],
        mainPackageJson: await loadPackageJson(fixture),
        includeSourceMapFiles: false,
        additionalFiles: [
            {
                sourceFilePath: additionalFileSourcePath,
                targetFilePath: 'docs/additional-info.txt'
            }
        ],
        moduleResolution: 'module',
        bundleDependencies: [],
        bundlePeerDependencies: [],
        additionalPackageJsonAttributes: {}
    });

    t.deepEqual(result, {
        additionalAttributes: {},
        packageJson: {
            main: 'entry.js',
            name: 'additional-files-package',
            version: '1.0.0'
        },
        manifestFile: {
            isExecutable: false,
            content: '{\n    "main": "entry.js",\n    "name": "additional-files-package",\n    "version": "1.0.0"\n}',
            filePath: 'package.json'
        },
        contents: [
            {
                directDependencies: new Set([path.join(fixture, 'src/greeting.js')]),
                fileDescription: {
                    content:
                        "import { greeting } from './greeting.js';\n\nexport function run() {\n    return greeting();\n}\n",
                    sourceFilePath: path.join(fixture, 'src/entry.js'),
                    isExecutable: false,
                    targetFilePath: 'entry.js'
                },
                isExplicitlyIncluded: false,
                isSubstituted: false
            },
            {
                directDependencies: new Set([]),
                fileDescription: {
                    content: "export function greeting() {\n    return 'hello from src';\n}\n",
                    sourceFilePath: path.join(fixture, 'src/greeting.js'),
                    isExecutable: false,
                    targetFilePath: 'greeting.js'
                },
                isExplicitlyIncluded: false,
                isSubstituted: false
            },
            {
                directDependencies: new Set([]),
                fileDescription: {
                    content: 'This file should be included in the bundle.\n',
                    sourceFilePath: additionalFileSourcePath,
                    isExecutable: false,
                    targetFilePath: 'docs/additional-info.txt'
                },
                isExplicitlyIncluded: true,
                isSubstituted: false
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
        packageType: undefined,
        peerDependencies: {},
        version: '1.0.0',
        typesMainFile: undefined
    });
});
