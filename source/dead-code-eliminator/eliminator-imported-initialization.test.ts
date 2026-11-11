import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { assertDeepSubset, assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import {
    assertDeadCodeEliminationBehaviorEquivalent,
    observeDeadCodeEliminationBehavior
} from '../test-libraries/dead-code-elimination-oracle-test-support.ts';
import { bundleResource, type BundleFixtureLinkedBundle as LinkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { bundleForCodeFile, inputs } from '../test-libraries/eliminator-test-support.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import type { AnalyzedBundle } from './analyzed-bundle.ts';
import { createDeadCodeEliminator, type InspectableDeadCodeEliminator } from './eliminator.ts';

type InitializationCase = {
    readonly name: string;
    readonly metadata: string;
    readonly modules: Readonly<Record<string, string>>;
    readonly remainingKeys: number;
    readonly nativeError: 'ReferenceError' | null;
};

const member = 'export const key="key";';
const consumer = 'import {key} from "schema-lib";const unused={[key]:1};' +
    'export function probe(){return 42;}';
const entry = 'import "schema-lib";export {probe} from "./consumer.js";';
const packageManifest = '{"type":"module","exports":"./index.js"}';

const cases: readonly InitializationCase[] = [
    {
        name: 'direct cycle',
        metadata: `import "../package/consumer.js";${member}`,
        modules: {},
        remainingKeys: 1,
        nativeError: 'ReferenceError'
    },
    {
        name: 'transitive cycle',
        metadata: `import "./bridge.js";${member}`,
        modules: { 'bridge.js': 'import "../package/consumer.js";' },
        remainingKeys: 1,
        nativeError: 'ReferenceError'
    },
    {
        name: 'hoisted import after the declaration',
        metadata: `${member}import "../package/consumer.js";`,
        modules: {},
        remainingKeys: 1,
        nativeError: 'ReferenceError'
    },
    {
        name: 'acyclic dependency',
        metadata: `import "./other.js";${member}`,
        modules: { 'other.js': 'export const before=1;' },
        remainingKeys: 0,
        nativeError: null
    },
    {
        name: 'shared dependency',
        metadata: `import "./a.js";import "./b.js";${member}`,
        modules: {
            'a.js': 'import "./leaf.js";',
            'b.js': 'export * from "./leaf.js";',
            'leaf.js': 'export const before=1;'
        },
        remainingKeys: 0,
        nativeError: null
    },
    {
        name: 'dependency with effects',
        metadata: `import "./other.js";${member}`,
        modules: { 'other.js': 'console.log("initialize");' },
        remainingKeys: 1,
        nativeError: null
    },
    {
        name: 'evaluated initializer',
        metadata: `function make(n){return n*2;}const before=make(21);${member}`,
        modules: {},
        remainingKeys: 0,
        nativeError: null
    },
    {
        name: 'dynamic import in an unused function',
        metadata: `function later(){return import("../package/consumer.js");}${member}`,
        modules: {},
        remainingKeys: 0,
        nativeError: null
    },
    {
        name: 'effect after initialization',
        metadata: `${member}console.log("initialized");`,
        modules: {},
        remainingKeys: 0,
        nativeError: null
    }
];

function applicationBundle(): LinkedBundle {
    const bundle = bundleForCodeFile({
        name: 'package',
        inputFilePath: '/repo/node_modules/package/index.js',
        targetFilePath: 'index.js',
        content: entry,
        extraResources: [ {
            ...bundleResource('/repo/node_modules/package/consumer.js', {
                targetFilePath: 'consumer.js',
                content: consumer
            }),
            isSubstituted: false
        } ]
    });
    return {
        ...bundle,
        contents: bundle.contents.map(function (resource) {
            return resource.fileDescription.targetFilePath === 'index.js'
                ? { ...resource, directDependencies: new Set([ 'consumer.js' ]) }
                : resource;
        })
    };
}

function initializationEliminator(libraryFiles: Readonly<Record<string, string>>): InspectableDeadCodeEliminator {
    return createDeadCodeEliminator({
        createProject() {
            return createProject({
                withFiles: [
                    { filePath: '/repo/node_modules/package/package.json', content: packageManifest },
                    { filePath: '/repo/node_modules/package/index.js', content: entry },
                    { filePath: '/repo/node_modules/package/consumer.js', content: consumer },
                    ...Object.entries(libraryFiles).map(function ([ targetFilePath, content ]) {
                        return { filePath: `/repo/node_modules/schema-lib/${targetFilePath}`, content };
                    })
                ]
            });
        },
        progressBroadcaster: {
            emit() {
                return undefined;
            },
            hasSubscribers() {
                return false;
            }
        },
        trace: undefined
    });
}

function assertRemainingKeys(output: AnalyzedBundle, expected: number): void {
    const emitted = output.contents.find(function (resource) {
        return resource.fileDescription.targetFilePath === 'consumer.js';
    });
    assertDefined(emitted);
    const source = createProject().createSourceFile('output.js', emitted.fileDescription.content);
    assert.strictEqual(source.getDescendantsOfKind(SyntaxKind.ComputedPropertyName).length, expected);
}

async function assertInitialization(fixture: InitializationCase): Promise<void> {
    const bundle = applicationBundle();
    const libraryFiles = { 'package.json': packageManifest, 'index.js': fixture.metadata, ...fixture.modules };
    const dependency = {
        name: 'schema-lib',
        roots: {},
        contents: Object.entries(libraryFiles).map(function ([ targetFilePath, content ]) {
            return { fileDescription: { targetFilePath, content } };
        })
    };
    const oracle = {
        name: fixture.name,
        entry: { bundleName: 'package', targetFilePath: 'index.js', exportName: 'probe' },
        bundles: [ bundle, dependency ]
    };
    const original = await observeDeadCodeEliminationBehavior(oracle);
    assertDeepSubset(
        original[0]?.result.observation,
        fixture.nativeError === null
            ? { error: null, value: 42 }
            : { error: { phase: 'evaluation', name: fixture.nativeError } }
    );
    const [ output ] = await initializationEliminator(libraryFiles).eliminate(inputs(bundle));
    assertDefined(output);
    await assertDeadCodeEliminationBehaviorEquivalent({
        ...oracle,
        leftName: 'native',
        leftBundles: oracle.bundles,
        rightName: 'emitted',
        rightBundles: [ output, dependency ]
    });
    assertRemainingKeys(output, fixture.remainingKeys);
}

suite('imported binding initialization', function () {
    for (const fixture of cases) {
        test(`preserves ${fixture.name}`, async function () {
            await assertInitialization(fixture);
        });
    }
});
