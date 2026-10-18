import path from 'node:path';
import assert from 'node:assert';
import { eachMapping, TraceMap } from '@jridgewell/trace-mapping';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { bindingAnalysis, emptyAnalysis } from '../analyzed-bundle-fixtures.ts';
import { loadPackageManifest } from '../load-package-manifest.ts';
import { asImplicitExportsBundle } from '../modern-bundle.ts';

function firstGeneratedColumn(mapContent: string): number | undefined {
    const columns: number[] = [];
    eachMapping(new TraceMap(mapContent), function (mapping) {
        if (columns.length === 0) {
            columns.push(mapping.generatedColumn);
        }
    });
    return columns[0];
}

suite('source-maps', function () {
    test('adds map files to the bundle when enabled', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/javascript-and-source-maps');
        const result = await packageProcessor.build({
            name: 'the-package-name',
            version: '42.0.0',
            sourcesFolder: path.join(fixture, 'source'),
            roots: { main: { javaScript: path.join(fixture, 'source/entry.js') } },
            mainPackageManifest: await loadPackageManifest(fixture),
            includeSourceMapFiles: true,
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
                    sideEffects: false,
                    type: 'module',
                    name: 'the-package-name',
                    version: '42.0.0'
                },
                manifestFile: {
                    content: '',
                    isExecutable: false,
                    filePath: 'package.json'
                },
                contents: [
                    {
                        directDependencies: new Set([
                            path.join(fixture, 'source/foo.js'),
                            path.join(fixture, 'source/entry.js.map')
                        ]),
                        fileDescription: {
                            content: "import { foo } from './foo.js';\n//# sourceMappingURL=entry.js.map\n",
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/entry.js'),
                            targetFilePath: 'entry.js'
                        },
                        isExplicitlyIncluded: false,
                        isSubstituted: false,
                        analysis: bindingAnalysis('foo')
                    },
                    {
                        directDependencies: new Set([
                            path.join(fixture, 'source/bar.js'),
                            path.join(fixture, 'source/foo.js.map')
                        ]),
                        fileDescription: {
                            content:
                                "import { bar } from './bar.js';\nexport const foo = 'foo';\n//# sourceMappingURL=foo.js.map\n",
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/foo.js'),
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
                                '{"version":3,"file":"entry.js","sourceRoot":"","sources":["./source/entry.ts"],"names":[],"mappings":""}\n',
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/entry.js.map'),
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
                            inputFilePath: path.join(fixture, 'source/bar.js'),
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
                                '{"version":3,"file":"foo.js","sourceRoot":"","sources":["./source/foo.ts"],"names":[],"mappings":""}\n',
                            isExecutable: false,
                            inputFilePath: path.join(fixture, 'source/foo.js.map'),
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
                    inputFilePath: path.join(fixture, 'source/entry.js'),
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

    test('recomposes nonempty source maps for linker-only rewrites', async function () {
        const fixture = path.join(process.cwd(), 'integration-tests/fixtures/source-map-linker-rewrite');
        const providerBundle = await packageProcessor.build({
            name: 'provider-package',
            version: '1.0.0',
            sourcesFolder: path.join(fixture, 'source'),
            roots: { main: { javaScript: path.join(fixture, 'source/provider.js') } },
            mainPackageManifest: await loadPackageManifest(fixture),
            includeSourceMapFiles: true,
            additionalFiles: [],
            bundleDependencies: [],
            bundlePeerDependencies: [],
            additionalPackageManifestAttributes: {},
            allowMutableSpecifiers: [],
            deadCodeElimination: { enabled: false }
        });
        const consumerBundle = await packageProcessor.build({
            name: 'consumer-package',
            version: '1.0.0',
            sourcesFolder: path.join(fixture, 'source'),
            roots: { main: { javaScript: path.join(fixture, 'source/consumer.js') } },
            mainPackageManifest: await loadPackageManifest(fixture),
            includeSourceMapFiles: true,
            additionalFiles: [],
            bundleDependencies: [ providerBundle ],
            bundlePeerDependencies: [],
            additionalPackageManifestAttributes: {},
            allowMutableSpecifiers: [],
            deadCodeElimination: { enabled: false }
        });

        const code = consumerBundle.contents.find(function (resource) {
            return resource.fileDescription.targetFilePath === 'consumer.js';
        });
        const map = consumerBundle.contents.find(function (resource) {
            return resource.fileDescription.targetFilePath === 'consumer.js.map';
        });

        assert.strictEqual(
            code?.fileDescription.content,
            [
                "import { dep } from 'provider-package'; export const value = dep;",
                '//# sourceMappingURL=consumer.js.map',
                ''
            ]
                .join('\n')
        );
        assert.strictEqual(firstGeneratedColumn(map?.fileDescription.content ?? ''), 53);
    });
});
