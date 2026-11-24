import assert from 'node:assert';
import { suite, test } from 'mocha';
import { analyzedBundleResource } from '../../test-libraries/bundle-fixtures.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { loadResources } from '../load-resource.ts';
import { removeEmptyModuleLinks } from './empty-module-links.ts';

function emittedModules(files: Readonly<Record<string, string>>): ReadonlyMap<string, string> {
    const resources = Object.entries(files).map(function ([ name, content ]) {
        return analyzedBundleResource(`/source/${name}`, { content });
    });
    const loaded = loadResources(createProject, resources, undefined);
    const outputs = resources.map(function (resource) {
        return { resource, transforms: [] };
    });
    return new Map(
        removeEmptyModuleLinks(outputs, loaded).map(function (output) {
            return [ output.resource.fileDescription.targetFilePath, output.resource.fileDescription.content ];
        })
    );
}

suite('empty module link proofs', function () {
    for (
        const [ name, content ] of [
            [ 'initialization effects', 'export {};console.log("effect");' ],
            [ 'script scope', ';' ],
            [ 'an invalid local export', 'export {missing};' ],
            [ 'runtime declarations', 'export const value=42;' ]
        ] as const
    ) {
        test(`preserves imports of modules with ${name}`, function () {
            const files = {
                'index.js': 'import "./dep.js";export const value=42;',
                'dep.js': content
            };
            assert.deepStrictEqual(emittedModules(files), new Map(Object.entries(files)));
        });
    }

    test('preserves a named forwarding request that must fail during linking', function () {
        const files = { 'index.js': 'export {missing} from "./dep.js";', 'dep.js': 'export {};' };
        assert.deepStrictEqual(emittedModules(files), new Map(Object.entries(files)));
    });

    test('preserves namespace exports from empty modules', function () {
        const files = { 'index.js': 'export * as api from "./dep.js";', 'dep.js': 'export {};' };
        assert.deepStrictEqual(emittedModules(files), new Map(Object.entries(files)));
    });

    test('preserves forwarding modules that evaluate a nonempty dependency', function () {
        const files = {
            'index.js': 'import "./middle.js";export const value=42;',
            'middle.js': 'export * from "./dep.js";',
            'dep.js': 'export const value=console.log("initialize");'
        };
        assert.deepStrictEqual(emittedModules(files), new Map(Object.entries(files)));
    });

    test('preserves module scope after removing the last module request', function () {
        const emitted = emittedModules({ 'index.js': 'import "./dep.js";', 'dep.js': 'export {};' });
        assert.strictEqual(emitted.get('index.js')?.trim(), 'export {};');
    });

    test('removes forwarding chains after dependencies become empty', function () {
        const emitted = emittedModules({
            'index.js': 'import "./middle.js";export const value=42;',
            'middle.js': 'export * from "./dep.js";',
            'dep.js': 'export {};'
        });
        assert.strictEqual(emitted.get('index.js'), 'export const value=42;');
        assert.strictEqual(emitted.get('middle.js')?.trim(), 'export {};');
    });

    test('removes links to modules containing only empty statements and exports', function () {
        const resources = [
            analyzedBundleResource('/source/index.js', {
                content: 'import "./empty.js";export const value=42;'
            }),
            analyzedBundleResource('/source/empty.js', { content: ';export {};;' })
        ];
        const loaded = loadResources(createProject, resources, undefined);
        const outputs = resources.map(function (resource) {
            return { resource, transforms: [] };
        });
        const result = removeEmptyModuleLinks(outputs, loaded);
        assert.strictEqual(result[0]?.resource.fileDescription.content, 'export const value=42;');
    });
});
