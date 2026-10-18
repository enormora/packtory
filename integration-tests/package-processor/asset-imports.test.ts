import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { loadPackageManifest } from '../load-package-manifest.ts';

type BuiltFixture = {
    readonly fixture: string;
    readonly bundle: Awaited<ReturnType<typeof packageProcessor.build>>;
};

async function buildFixture(fixtureName: string): Promise<BuiltFixture> {
    const fixture = path.join(process.cwd(), 'integration-tests/fixtures', fixtureName);
    return {
        fixture,
        bundle: await packageProcessor.build({
            name: fixtureName,
            version: '1.2.3',
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
        })
    };
}

suite('asset-imports', function () {
    test('bundles local json files imported with import attributes', async function () {
        const { bundle } = await buildFixture('local-structured-data-import');

        const entry = bundle.contents.find(function (resource) {
            return resource.fileDescription.targetFilePath === 'entry.js';
        });
        const javaScriptObjectNotation = bundle.contents.find(function (resource) {
            return resource.fileDescription.targetFilePath === 'data.json';
        });

        if (entry === undefined || javaScriptObjectNotation === undefined) {
            assert.fail('expected bundled entry and json resources');
        }
        assert.deepStrictEqual(
            {
                directDependencies: entry.directDependencies,
                content: entry.fileDescription.content,
                moduleReferences: entry.moduleReferences
            },
            {
                directDependencies: new Set([ 'data.json' ]),
                content: 'import data from "./data.json" with { type: "json" };\n\nexport default data;\n',
                moduleReferences: [
                    {
                        emittedSpecifier: './data.json',
                        sourceSpecifier: './data.json',
                        targetFilePath: 'data.json',
                        type: 'local-asset'
                    }
                ]
            }
        );
        assert.strictEqual(javaScriptObjectNotation.fileDescription.content, '{\n    "message": "hello"\n}\n');
    });

    test('bundles local wasm files', async function () {
        const { bundle } = await buildFixture('local-webassembly-import');

        const entry = bundle.contents.find(function (resource) {
            return resource.fileDescription.targetFilePath === 'entry.js';
        });
        const wasm = bundle.contents.find(function (resource) {
            return resource.fileDescription.targetFilePath === 'module.wasm';
        });

        if (entry === undefined || wasm === undefined) {
            assert.fail('expected bundled entry and wasm resources');
        }
        assert.deepStrictEqual(entry.directDependencies, new Set([ 'module.wasm' ]));
        assert.strictEqual(wasm.fileDescription.content, 'wasm-binary-placeholder\n');
    });

    test('tracks package-owned json imports as dependencies without bundling the file', async function () {
        const { bundle } = await buildFixture('package-manifest-import');

        assert.deepStrictEqual(bundle.packageManifest.dependencies, { foo: '^1.0.0' });
        assert.strictEqual(
            bundle.contents.some(function (resource) {
                return resource.fileDescription.targetFilePath === 'package.json';
            }),
            false
        );
    });

    test('tracks package-owned wasm imports as dependencies without bundling the file', async function () {
        const { bundle } = await buildFixture('package-webassembly-import');

        assert.deepStrictEqual(bundle.packageManifest.dependencies, { foo: '^1.0.0' });
        assert.strictEqual(
            bundle.contents.some(function (resource) {
                return resource.fileDescription.targetFilePath.endsWith('.wasm');
            }),
            false
        );
    });

    test('uses the generated runtime manifest for root package.json imports', async function () {
        const { bundle } = await buildFixture('generated-package-manifest-import');

        const entry = bundle.contents.find(function (resource) {
            return resource.fileDescription.targetFilePath === 'entry.js';
        });
        const generatedManifestResource = bundle.contents.find(function (resource) {
            return resource.fileDescription.targetFilePath === 'package.json';
        });

        if (entry === undefined || generatedManifestResource === undefined) {
            assert.fail('expected bundled entry and generated manifest resources');
        }
        assert.deepStrictEqual(
            {
                directDependencies: entry.directDependencies,
                content: entry.fileDescription.content,
                moduleReferences: entry.moduleReferences
            },
            {
                directDependencies: new Set([ 'package.json' ]),
                content: 'import manifest from "./package.json" with { type: "json" };\n\nexport default manifest;\n',
                moduleReferences: [
                    {
                        emittedSpecifier: './package.json',
                        sourceSpecifier: './package.json',
                        targetFilePath: 'package.json',
                        type: 'generated-manifest'
                    }
                ]
            }
        );
        assert.strictEqual(generatedManifestResource.isGeneratedManifest, true);
        assert.deepStrictEqual(JSON.parse(bundle.manifestFile.content), {
            exports: { '.': { import: './entry.js' } },
            name: 'generated-package-manifest-import',
            sideEffects: false,
            type: 'module',
            version: '1.2.3'
        });
    });
});
