import assert from 'node:assert';
import { suite, test } from 'mocha';
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
    return loadResources(
        createProject,
        Object.entries(files).map(function ([ targetFilePath, content ]) {
            return {
                ...bundleResource(`/source/${targetFilePath}`, { content, targetFilePath }),
                isSubstituted: false
            };
        })
    );
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
                { ...forwardingFiles, 'barrel.js': `console.log(1);${forwardingFiles['barrel.js']}` }
            ],
            [ 'import attributes', 'import {read} from "./barrel.js" with {type:"json"};', forwardingFiles ],
            [ 'default binding', 'import value,{read} from "./barrel.js";', forwardingFiles ],
            [ 'invalid importer', `${request}const read=1;`, forwardingFiles ],
            [ 'another named request', 'import {read,missing} from "./barrel.js";', forwardingFiles ],
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
            'nested/index.js': 'export {read} from "../barrel.js";'
        });
        const prepared = bypassFunctionForwarding(loaded);
        assert.strictEqual(moduleSource(prepared, 'nested/index.js'), 'export {read} from "../lib/read.js";');
        assert.strictEqual(moduleSource(prepared, 'lib/read.js'), provider);
    });

    for (const targetFilePath of [ 'lib/read.js', 'lib/other.js' ]) {
        test(`preserves the resolved target of an existing specifier for ${targetFilePath}`, function () {
            const entrySource = `import "./lib/read.js";${request}`;
            const loaded = loadModules({ 'index.js': entrySource, ...forwardingFiles }).map(function (entry) {
                if (entry.resource.fileDescription.targetFilePath !== 'index.js') {
                    return entry;
                }
                const moduleReferences = entry.resource.moduleReferences.map(function (reference) {
                    return reference.type === 'local-code' && reference.emittedSpecifier === './lib/read.js'
                        ? { ...reference, targetFilePath }
                        : reference;
                });
                return { ...entry, resource: { ...entry.resource, moduleReferences } };
            });
            const prepared = bypassFunctionForwarding(loaded);
            const [ entry ] = prepared;
            assertDefined(entry);
            const expected = targetFilePath === 'lib/read.js'
                ? 'import "./lib/read.js";import {read} from "./lib/read.js";'
                : entrySource;
            assert.strictEqual(moduleSource(prepared, 'index.js'), expected);
            assert.strictEqual(entry.resource.moduleReferences.length, 2);
        });
    }
});
