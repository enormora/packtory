import path from 'node:path';
import assert from 'node:assert';
import { test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { bindingAnalysis, emptyAnalysis } from '../dce-helpers.ts';
import { loadPackageJson } from '../load-package-json.ts';

test('adds map files to the bundle when enabled', async () => {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures/js-and-source-maps');
    const result = await packageProcessor.build({
        name: 'the-package-name',
        version: '42.0.0',
        sourcesFolder: path.join(fixture, 'src'),
        entryPoints: [{ js: path.join(fixture, 'src/entry.js') }],
        mainPackageJson: await loadPackageJson(fixture),
        includeSourceMapFiles: true,
        additionalFiles: [],
        bundleDependencies: [],
        bundlePeerDependencies: [],
        additionalPackageJsonAttributes: {},
        allowMutableSpecifiers: [],
        deadCodeElimination: { enabled: false }
    });

    assert.deepStrictEqual(result, {
        additionalAttributes: {},
        packageJson: {
            main: 'entry.js',
            sideEffects: false,
            type: 'module',
            name: 'the-package-name',
            version: '42.0.0'
        },
        manifestFile: {
            content:
                '{\n    "main": "entry.js",\n    "name": "the-package-name",\n    "sideEffects": false,\n    "type": "module",\n    "version": "42.0.0"\n}',
            isExecutable: false,
            filePath: 'package.json'
        },
        contents: [
            {
                directDependencies: new Set([path.join(fixture, 'src/foo.js'), path.join(fixture, 'src/entry.js.map')]),
                fileDescription: {
                    content: "import { foo } from './foo.js';\n//# sourceMappingURL=entry.js.map\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry.js'),
                    targetFilePath: 'entry.js'
                },
                isExplicitlyIncluded: false,
                isSubstituted: false,
                analysis: bindingAnalysis('foo')
            },
            {
                directDependencies: new Set([path.join(fixture, 'src/bar.js'), path.join(fixture, 'src/foo.js.map')]),
                fileDescription: {
                    content:
                        "import { bar } from './bar.js';\nexport const foo = 'foo';\n//# sourceMappingURL=foo.js.map\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/foo.js'),
                    targetFilePath: 'foo.js'
                },
                isExplicitlyIncluded: false,
                isSubstituted: false,
                analysis: bindingAnalysis('bar', 'foo')
            },
            {
                directDependencies: new Set(),
                fileDescription: {
                    content:
                        '{"version":3,"file":"entry.js","sourceRoot":"","sources":["./src/entry.ts"],"names":[],"mappings":""}\n',
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/entry.js.map'),
                    targetFilePath: 'entry.js.map'
                },
                isExplicitlyIncluded: false,
                isSubstituted: false,
                analysis: emptyAnalysis
            },
            {
                directDependencies: new Set(),
                fileDescription: {
                    content: "export const bar = 'bar';\n",
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/bar.js'),
                    targetFilePath: 'bar.js'
                },
                isExplicitlyIncluded: false,
                isSubstituted: false,
                analysis: bindingAnalysis('bar')
            },
            {
                directDependencies: new Set(),
                fileDescription: {
                    content:
                        '{"version":3,"file":"foo.js","sourceRoot":"","sources":["./src/foo.ts"],"names":[],"mappings":""}\n',
                    isExecutable: false,
                    sourceFilePath: path.join(fixture, 'src/foo.js.map'),
                    targetFilePath: 'foo.js.map'
                },
                isExplicitlyIncluded: false,
                isSubstituted: false,
                analysis: emptyAnalysis
            }
        ],
        dependencies: {},
        mainFile: {
            content: "import { foo } from './foo.js';\n//# sourceMappingURL=entry.js.map\n",
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
    });
});
