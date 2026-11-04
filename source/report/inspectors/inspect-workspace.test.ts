import assert from 'node:assert';
import { suite, test } from 'mocha';
import { explicitPackageSurface } from '../../package-surface/surface.ts';
import type { LinkedBundleResource } from '../../linker/linked-bundle.ts';
import { bundleResource, linkedBundle } from '../../test-libraries/bundle-fixtures.ts';
import { inspectWorkspace } from '../../test-libraries/workspace-inspector.ts';

function resource(filePath: string, content: string): LinkedBundleResource {
    return { ...bundleResource(filePath, { content }), isSubstituted: false };
}

suite('inspect workspace', function () {
    test('captures files, static runtime aliases, and declaration type exports', function () {
        const bundle = linkedBundle({
            name: 'pkg',
            contents: [
                resource('/source/index.js', "export { value as alias } from './value.js'; export default 1;"),
                resource('/source/value.js', 'export const value = 1;'),
                resource(
                    '/source/index.d.ts',
                    'export interface Shape { value: string; } export declare class Model {}'
                ),
                resource('/source/readme.md', 'Hello')
            ]
        });
        const snapshot = inspectWorkspace(bundle, { dependencies: { dep: '^1' }, peerDependencies: { peer: '^2' } });
        const root = snapshot.modules.find(function (module) {
            return module.specifier === 'pkg';
        });
        assert.deepStrictEqual(root, {
            specifier: 'pkg',
            values: [ 'alias', 'default' ],
            types: [ 'Model', 'Shape' ],
            complete: true
        });
        assert.ok(snapshot.files.some(function (file) {
            return file.sourcePath === '/source/readme.md' && file.sizeBytes === 5;
        }));
        assert.partialDeepStrictEqual(snapshot, { dependencies: { dep: '^1' }, peerDependencies: { peer: '^2' } });
    });

    test('records unresolved external forwarding as incomplete', function () {
        const snapshot = inspectWorkspace(
            linkedBundle({
                name: 'pkg',
                contents: [ resource('/source/index.js', "export * from 'unknown-package';") ]
            }),
            { dependencies: undefined, peerDependencies: undefined }
        );
        assert.deepStrictEqual(
            snapshot.modules.find(function (module) {
                return module.specifier === 'pkg';
            }),
            { specifier: 'pkg', values: [], types: [], complete: false }
        );
    });

    test('reports missing roots without inventing export names', function () {
        const snapshot = inspectWorkspace(linkedBundle({ name: 'pkg', contents: [] }), {
            dependencies: undefined,
            peerDependencies: undefined
        });
        assert.deepStrictEqual(snapshot.modules, [ { specifier: 'pkg', values: [], types: [], complete: false } ]);
    });

    test('excludes generated manifests and keeps assets outside symbol analysis', function () {
        const generated = { ...resource('/source/package.json', '{}'), isGeneratedManifest: true } as const;
        const snapshot = inspectWorkspace(
            linkedBundle({
                name: 'pkg',
                contents: [
                    resource('/source/index.js', 'export class RuntimeOnly {}'),
                    resource('/source/readme.md', '€'),
                    generated
                ]
            }),
            { dependencies: undefined, peerDependencies: undefined }
        );
        assert.deepStrictEqual(snapshot.files, [
            { sourcePath: '/source/index.js', path: 'index.js', sizeBytes: 27 },
            { sourcePath: '/source/readme.md', path: 'readme.md', sizeBytes: 3 }
        ]);
        assert.deepStrictEqual(
            snapshot.modules.find(function (module) {
                return module.specifier === 'pkg';
            }),
            { specifier: 'pkg', values: [ 'RuntimeOnly' ], types: [], complete: true }
        );
        assert.strictEqual(
            snapshot
                .modules
                .find(function (module) {
                    return module.specifier === 'pkg/readme.md';
                })
                ?.complete,
            false
        );
    });

    test('keeps unresolved declaration forwarding unknown even when runtime exports resolve', function () {
        const snapshot = inspectWorkspace(
            linkedBundle({
                name: 'pkg',
                contents: [
                    resource('/source/index.js', 'export const value = 1;'),
                    resource('/source/index.d.ts', "export { Missing } from 'unknown';")
                ]
            }),
            { dependencies: undefined, peerDependencies: undefined }
        );
        assert.deepStrictEqual(
            snapshot.modules.find(function (module) {
                return module.specifier === 'pkg';
            }),
            { specifier: 'pkg', values: [ 'value' ], types: [], complete: false }
        );
    });

    test('selects an available declaration fallback by path rather than resource order', function () {
        const runtime = resource('/source/main.mjs', 'export const value = 1;');
        const declaration = resource('/source/main.d.ts', 'export interface Shape {}');
        const snapshot = inspectWorkspace(
            linkedBundle({
                name: 'pkg',
                roots: {
                    main: {
                        javaScript: runtime.fileDescription,
                        declarationFile: declaration.fileDescription
                    }
                },
                contents: [ declaration, runtime ]
            }),
            { dependencies: undefined, peerDependencies: undefined }
        );
        assert.deepStrictEqual(
            snapshot.modules.find(function (module) {
                return module.specifier === 'pkg';
            }),
            { specifier: 'pkg', values: [ 'value' ], types: [ 'Shape' ], complete: true }
        );
    });

    test('captures executable mappings without exposing executable roots as modules', function () {
        const runtime = resource('/source/cli.js', '#!/usr/bin/env node\nconsole.log(1);');
        const snapshot = inspectWorkspace(
            linkedBundle({
                name: 'pkg',
                roots: { main: { javaScript: runtime.fileDescription } },
                surface: explicitPackageSurface({ executables: [ { name: 'tool', root: 'main' } ] }),
                contents: [ runtime ]
            }),
            { dependencies: undefined, peerDependencies: undefined }
        );
        assert.deepStrictEqual({ modules: snapshot.modules, executables: snapshot.executables }, {
            modules: [],
            executables: '{"tool":"./cli.js"}'
        });
    });
});
