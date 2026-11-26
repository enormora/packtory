import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { ArtifactModuleReference } from '../../resource-resolver/resolved-bundle.ts';
import { bundleResource } from '../../test-libraries/bundle-fixtures.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { loadResources, type LoadedResource } from '../load-resource.ts';
import { bypassFunctionForwarding } from './function-forwarding.ts';

const request = 'import {read} from "./barrel.js";';
const leaf = 'export function read(value){return value*2;}';
const forwardingFiles = {
    'barrel.js': 'export {read} from "./lib/read.js";',
    'lib/read.js': leaf
};

function loadModules(files: Readonly<Record<string, string>>): readonly LoadedResource[] {
    const loaded = loadResources(
        createProject,
        Object.entries(files).map(function ([ targetFilePath, content ]) {
            return {
                ...bundleResource(`/source/${targetFilePath}`, { content, targetFilePath }),
                isSubstituted: false
            };
        }),
        undefined
    );
    return loaded.map(function (entry) {
        return entry.sourceFile === undefined ? entry : {
            ...entry,
            applyEdits(edits) {
                assert.notDeepStrictEqual(edits, []);
                entry.applyEdits(edits);
            }
        };
    });
}

function moduleSource(loaded: readonly LoadedResource[], path: string): string | undefined {
    return loaded
        .find(function (entry) {
            return entry.resource.fileDescription.targetFilePath === path;
        })
        ?.sourceFile
        ?.getFullText();
}

suite('function forwarding proofs', function () {
    for (
        const [ description, entry, files ] of [
            [ 'external provider', request, { 'barrel.js': 'export {read} from "elsewhere";' } ],
            [ 'missing provider', request, { 'barrel.js': forwardingFiles['barrel.js'] } ],
            [ 'missing export', request, { ...forwardingFiles, 'lib/read.js': 'function read(){}' } ],
            [ 'renamed export', request, {
                ...forwardingFiles,
                'barrel.js': 'export {read as other} from "./lib/read.js";'
            } ],
            [ 'invalid provider', request, { ...forwardingFiles, 'lib/read.js': 'export function read(x,x){}' } ],
            [
                'invalid forwarder',
                request,
                { ...forwardingFiles, 'barrel.js': 'export {read,read} from "./lib/read.js";' }
            ],
            [
                'forwarder with attributes',
                request,
                { ...forwardingFiles, 'barrel.js': 'export {read} from "./lib/read.js" with {type:"json"};' }
            ],
            [
                'forwarder with initialization',
                request,
                { ...forwardingFiles, 'barrel.js': `${forwardingFiles['barrel.js']}console.log(1);` }
            ],
            [ 'import attributes', 'import {read} from "./barrel.js" with {type:"json"};', forwardingFiles ],
            [ 'default binding', 'import value,{read} from "./barrel.js";', forwardingFiles ],
            [ 'invalid importer', `${request}const read=1;`, forwardingFiles ],
            [ 'another named request', 'import {read,missing} from "./barrel.js";', forwardingFiles ],
            [ 'local export', 'function read(){}export {read};', forwardingFiles ],
            [ 'mixed forwarder', request, {
                ...forwardingFiles,
                'barrel.js': 'export {read,missing} from "./lib/read.js";'
            } ],
            [ 'external request', 'import {read} from "elsewhere";', forwardingFiles ],
            [
                'path requiring encoding',
                request,
                {
                    'barrel.js': 'export {read} from "./lib/read value.js";',
                    'lib/read value.js': leaf
                }
            ]
        ] as const
    ) {
        test(`preserves the request for a ${description}`, function () {
            const loaded = loadModules({ 'index.js': entry, ...files });
            assert.strictEqual(moduleSource(bypassFunctionForwarding(loaded), 'index.js'), entry);
        });
    }

    test('redirects to a parent directory and preserves the defining module', function () {
        const provider = `;function privateRead(){};export default function other(){};${leaf}`;
        const loaded = loadModules({
            ...forwardingFiles,
            'barrel.js': `;${forwardingFiles['barrel.js']}`,
            'lib/read.js': provider,
            'nested/index.js': 'export {read} from "../barrel.js";',
            'index.jsx': request,
            'asset.json': '{}'
        });
        const prepared = bypassFunctionForwarding(loaded);
        assert.strictEqual(moduleSource(prepared, 'nested/index.js'), 'export {read} from "../lib/read.js";');
        assert.strictEqual(moduleSource(prepared, 'lib/read.js'), provider);
        assert.strictEqual(moduleSource(prepared, 'index.jsx'), request);
    });

    for (
        const [ targetFilePath, linked, expected ] of [
            [ 'lib/read.js', false, 'import "./lib/read.js";import {read} from "./lib/read.js";' ],
            [ 'lib/other.js', false, null ],
            [ 'lib/read.js', true, null ]
        ] as const
    ) {
        test(`preserves the existing specifier for ${targetFilePath} (linked: ${String(linked)})`, function () {
            const entrySource = `import "./lib/read.js";${request}`;
            const loaded = loadModules({ 'index.js': entrySource, ...forwardingFiles }).map(function (entry) {
                if (entry.resource.fileDescription.targetFilePath !== 'index.js') {
                    return entry;
                }
                const moduleReferences = entry.resource.moduleReferences.map(
                    function (reference): ArtifactModuleReference {
                        if (reference.type !== 'local-code' || reference.emittedSpecifier !== './lib/read.js') {
                            return reference;
                        }
                        return linked
                            ? { ...reference, type: 'linked-code', targetFilePath, packageName: 'library' }
                            : { ...reference, targetFilePath };
                    }
                );
                return { ...entry, resource: { ...entry.resource, moduleReferences } };
            });
            const prepared = bypassFunctionForwarding(loaded);
            const [ entry ] = prepared;
            assertDefined(entry);
            assert.strictEqual(moduleSource(prepared, 'index.js'), expected ?? entrySource);
            assert.strictEqual(entry.resource.moduleReferences.length, 2);
        });
    }

    test('resolves the forwarder using the matching artifact reference', function () {
        const loaded = loadModules({ 'index.js': request, ...forwardingFiles }).map(function (entry) {
            if (entry.resource.fileDescription.targetFilePath !== 'barrel.js') {
                return entry;
            }
            const decoy: ArtifactModuleReference = {
                type: 'external-package',
                sourceSpecifier: 'elsewhere',
                emittedSpecifier: 'elsewhere',
                packageName: 'elsewhere'
            };
            return {
                ...entry,
                resource: { ...entry.resource, moduleReferences: [ decoy, ...entry.resource.moduleReferences ] }
            };
        });
        assert.strictEqual(
            moduleSource(bypassFunctionForwarding(loaded), 'index.js'),
            'import {read} from "./lib/read.js";'
        );
    });

    test('retains a request without a resolved artifact reference', function () {
        const loaded = loadModules({ 'index.js': request, ...forwardingFiles }).map(function (entry) {
            return entry.resource.fileDescription.targetFilePath === 'index.js'
                ? { ...entry, resource: { ...entry.resource, moduleReferences: [] } }
                : entry;
        });
        assert.strictEqual(moduleSource(bypassFunctionForwarding(loaded), 'index.js'), request);
    });

    test('leaves resources without parsed source untouched', function () {
        const loaded = loadModules({ 'index.js': request, 'asset.json': '{}', ...forwardingFiles });
        const asset = loaded.find(function (entry) {
            return entry.resource.fileDescription.targetFilePath === 'asset.json';
        });
        assertDefined(asset);
        const opaque = {
            ...asset,
            resource: {
                ...asset.resource,
                fileDescription: { ...asset.resource.fileDescription, targetFilePath: 'opaque.js' }
            }
        };
        const prepared = bypassFunctionForwarding([ ...loaded, opaque ]);
        assert.deepStrictEqual(prepared.at(-1), opaque);
    });
});
