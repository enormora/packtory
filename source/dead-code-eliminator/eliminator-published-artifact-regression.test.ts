import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { bundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { bundleForCodeFile, inputs } from '../test-libraries/eliminator-test-support.ts';

function resource(inputFilePath: string, targetFilePath: string, content: string): LinkedBundleResource {
    return {
        ...bundleResource(inputFilePath, { content, targetFilePath }),
        isSubstituted: false
    };
}

function fileManagerResource(): LinkedBundleResource {
    return resource(
        '/source/file-manager/file-manager.ts',
        'file-manager/file-manager.js',
        [
            'import { isExecutableFileMode } from "./permissions.js";',
            '',
            'export function api() {',
            '    return isExecutableFileMode(0o755);',
            '}',
            ''
        ]
            .join('\n')
    );
}

function permissionsResource(): LinkedBundleResource {
    return resource(
        '/source/file-manager/permissions.ts',
        'file-manager/permissions.js',
        [
            'export function isExecutableFileMode(mode) {',
            '    return mode === 0o755;',
            '}',
            '',
            'export function unusedPermissionMode() {',
            '    return false;',
            '}',
            ''
        ]
            .join('\n')
    );
}

function fileManagerBundle(): LinkedBundle {
    const fileManager = fileManagerResource();
    return linkedBundle({
        name: 'pkg',
        contents: [ fileManager, permissionsResource() ],
        roots: {
            main: {
                js: {
                    content: fileManager.fileDescription.content,
                    isExecutable: false,
                    inputFilePath: '/source/file-manager/file-manager.ts',
                    targetFilePath: 'file-manager/file-manager.js'
                }
            }
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });
}

suite('published artifact dead code elimination regressions', function () {
    test('eliminate resolves emitted js imports against js target paths from ts source identities', async function () {
        const eliminator = createTestEliminator();
        const [ analyzed ] = await eliminator.eliminate(inputs(fileManagerBundle()));
        const emittedPermissions = analyzed?.contents.find(function (entry) {
            return entry.fileDescription.targetFilePath === 'file-manager/permissions.js';
        });

        assertDefined(emittedPermissions);
        assert.strictEqual(emittedPermissions.fileDescription.inputFilePath, '/source/file-manager/permissions.ts');
        assert.strictEqual(emittedPermissions.fileDescription.content.includes('isExecutableFileMode'), true);
        assert.strictEqual(emittedPermissions.fileDescription.content.includes('unusedPermissionMode'), false);
        assert.deepStrictEqual(emittedPermissions.analysis.survivingBindings, new Set([ 'isExecutableFileMode' ]));
    });

    test('eliminate resolves emitted imports from source-map authored input paths by target path', async function () {
        const eliminator = createTestEliminator();
        const entry = resource(
            '/workspace/src/file-manager.ts',
            'dist/file-manager.js',
            'import { allowed } from "./permissions.js";\nexport const api = allowed;\n'
        );
        const bundle = linkedBundle({
            name: 'pkg',
            contents: [
                entry,
                resource(
                    '/workspace/src/permissions.ts',
                    'dist/permissions.js',
                    'export const allowed = true;\nexport const unused = false;\n'
                )
            ],
            roots: {
                main: {
                    js: {
                        content: entry.fileDescription.content,
                        isExecutable: false,
                        inputFilePath: '/workspace/src/file-manager.ts',
                        targetFilePath: 'dist/file-manager.js'
                    }
                }
            },
            surface: { mode: 'implicit', defaultModuleRoot: 'main' }
        });

        const [ analyzed ] = await eliminator.eliminate(inputs(bundle));
        const emittedPermissions = analyzed?.contents.find(function (candidate) {
            return candidate.fileDescription.targetFilePath === 'dist/permissions.js';
        });

        assertDefined(emittedPermissions);
        assert.strictEqual(emittedPermissions.fileDescription.content.includes('allowed'), true);
        assert.strictEqual(emittedPermissions.fileDescription.content.includes('unused'), false);
    });

    test('eliminate keeps a local function named by a surviving local export declaration', async function () {
        const eliminator = createTestEliminator();
        const content = [
            'function arePureCallArguments() {}',
            '',
            'function unused() {}',
            '',
            'export { arePureCallArguments };',
            ''
        ]
            .join('\n');
        const bundle = bundleForCodeFile({
            name: 'pkg',
            inputFilePath: '/src/imported-expression-origin.ts',
            targetFilePath: 'dead-code-eliminator/imported-expression-origin.js',
            content
        });

        const [ analyzed ] = await eliminator.eliminate(inputs(bundle));
        const emitted = analyzed?.contents[0];

        assertDefined(emitted);
        assert.strictEqual(emitted.fileDescription.content.includes('function arePureCallArguments()'), true);
        assert.strictEqual(emitted.fileDescription.content.includes('function unused()'), false);
        assert.strictEqual(emitted.fileDescription.content.includes('export { arePureCallArguments };'), true);
    });
});
