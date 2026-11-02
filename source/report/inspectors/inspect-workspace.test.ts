import assert from 'node:assert';
import { suite, test } from 'mocha';
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
});
