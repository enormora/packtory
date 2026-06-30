import path from 'node:path';
import assert from 'node:assert';
import { suite, test } from 'mocha';
import { packageProcessor } from '../../source/packages/package-processor/package-processor.entry-point.ts';
import { loadPackageJson } from '../load-package-json.ts';

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
        })
    };
}

suite('asset-imports', function () {
    test('bundles local json files imported with import attributes', async function () {
        const { fixture, bundle } = await buildFixture('local-json-import');

        const entry = bundle.contents.find(function (resource) {
            return resource.fileDescription.targetFilePath === 'entry.js';
        });
        const json = bundle.contents.find(function (resource) {
            return resource.fileDescription.targetFilePath === 'data.json';
        });

        assert.ok(entry !== undefined);
        assert.ok(json !== undefined);
        assert.deepStrictEqual(entry.directDependencies, new Set([ path.join(fixture, 'src/data.json') ]));
        assert.strictEqual(
            entry.fileDescription.content,
            'import data from "./data.json" with { type: "json" };\n\nexport default data;\n'
        );
        assert.strictEqual(json.fileDescription.content, '{\n    "message": "hello"\n}\n');
    });

    test('bundles local wasm files', async function () {
        const { fixture, bundle } = await buildFixture('local-wasm-import');

        const entry = bundle.contents.find(function (resource) {
            return resource.fileDescription.targetFilePath === 'entry.js';
        });
        const wasm = bundle.contents.find(function (resource) {
            return resource.fileDescription.targetFilePath === 'module.wasm';
        });

        assert.ok(entry !== undefined);
        assert.ok(wasm !== undefined);
        assert.deepStrictEqual(entry.directDependencies, new Set([ path.join(fixture, 'src/module.wasm') ]));
        assert.strictEqual(wasm.fileDescription.content, 'wasm-binary-placeholder\n');
    });

    test('tracks package-owned json imports as dependencies without bundling the file', async function () {
        const { bundle } = await buildFixture('package-json-import');

        assert.deepStrictEqual(bundle.packageJson.dependencies, { foo: '^1.0.0' });
        assert.strictEqual(
            bundle.contents.some(function (resource) {
                return resource.fileDescription.targetFilePath === 'package.json';
            }),
            false
        );
    });

    test('tracks package-owned wasm imports as dependencies without bundling the file', async function () {
        const { bundle } = await buildFixture('package-wasm-import');

        assert.deepStrictEqual(bundle.packageJson.dependencies, { foo: '^1.0.0' });
        assert.strictEqual(
            bundle.contents.some(function (resource) {
                return resource.fileDescription.targetFilePath.endsWith('.wasm');
            }),
            false
        );
    });

    test('uses the generated runtime manifest for root package.json imports', async function () {
        const { fixture, bundle } = await buildFixture('generated-package-json-import');

        const entry = bundle.contents.find(function (resource) {
            return resource.fileDescription.targetFilePath === 'entry.js';
        });
        const generatedManifestResource = bundle.contents.find(function (resource) {
            return resource.fileDescription.targetFilePath === 'package.json';
        });

        assert.ok(entry !== undefined);
        assert.ok(generatedManifestResource !== undefined);
        assert.deepStrictEqual(entry.directDependencies, new Set([ path.join(fixture, 'src/package.json') ]));
        assert.strictEqual(
            entry.fileDescription.content,
            'import manifest from "./package.json" with { type: "json" };\n\nexport default manifest;\n'
        );
        assert.strictEqual(generatedManifestResource.isGeneratedManifest, true);
        assert.deepStrictEqual(JSON.parse(bundle.manifestFile.content), {
            exports: { '.': { import: './entry.js' } },
            name: 'generated-package-json-import',
            sideEffects: false,
            type: 'module',
            version: '1.2.3'
        });
    });
});
