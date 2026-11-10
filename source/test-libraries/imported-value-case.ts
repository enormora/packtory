import assert from 'node:assert';
import { createDeadCodeEliminator, type InspectableDeadCodeEliminator } from '../dead-code-eliminator/eliminator.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { assertDeepSubset, assertDefined } from './deep-subset-assertion.ts';
import {
    assertDeadCodeEliminationBehaviorEquivalent,
    observeDeadCodeEliminationBehavior,
    type DeadCodeEliminationBehaviorComparison
} from './dead-code-elimination-oracle-test-support.ts';
import { bundleResource, type BundleFixtureLinkedBundle as LinkedBundle } from './bundle-fixtures.ts';
import { bundleForCodeFile, inputs } from './eliminator-test-support.ts';
import { createProject } from './typescript-project.ts';

export type ImportedValueCase = readonly [
    name: string,
    files: Readonly<Record<string, string>>,
    library: string,
    removed: string | null,
    retained: string | null,
    nativeError: string | null
];

const packageManifest = '{"type":"module","exports":"./index.js"}';

function valueBundle(files: Readonly<Record<string, string>>): LinkedBundle {
    const content = files['index.js'];
    assertDefined(content);
    const original = bundleForCodeFile({
        name: 'package',
        inputFilePath: '/repo/node_modules/package/index.js',
        targetFilePath: 'index.js',
        content,
        extraResources: Object
            .entries(files)
            .filter(function ([ name ]) {
                return name !== 'index.js';
            })
            .map(function ([ name, text ]) {
                return {
                    ...bundleResource(`/repo/node_modules/package/${name}`, { targetFilePath: name, content: text }),
                    isSubstituted: false
                };
            })
    });
    return {
        ...original,
        contents: original.contents.map(function (resource) {
            const references = resource.moduleReferences.filter(function (reference) {
                return reference.type === 'local-code';
            });
            return {
                ...resource,
                directDependencies: new Set(references.map(function (reference) {
                    return reference.targetFilePath;
                }))
            };
        })
    };
}

function valueEliminator(files: Readonly<Record<string, string>>, library: string): InspectableDeadCodeEliminator {
    return createDeadCodeEliminator({
        createProject() {
            return createProject({
                withFiles: [
                    { filePath: '/repo/node_modules/schema-lib/package.json', content: packageManifest },
                    { filePath: '/repo/node_modules/schema-lib/index.js', content: library },
                    { filePath: '/repo/node_modules/package/package.json', content: packageManifest },
                    ...Object.entries(files).map(function ([ name, content ]) {
                        return { filePath: `/repo/node_modules/package/${name}`, content };
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

async function valueComparison(files: Readonly<Record<string, string>>, library: string): Promise<{
    readonly original: LinkedBundle;
    readonly emitted: AnalyzedBundle;
    readonly dependency: DeadCodeEliminationBehaviorComparison['leftBundles'][number];
    readonly content: string;
}> {
    const original = valueBundle(files);
    const [ emitted ] = await valueEliminator(files, library).eliminate(inputs(original));
    assertDefined(emitted);
    const dependency = {
        name: 'schema-lib',
        roots: {},
        contents: [ { fileDescription: { targetFilePath: 'index.js', content: library } } ]
    };
    const content = emitted
        .contents
        .find(function (resource) {
            return resource.fileDescription.targetFilePath === 'index.js';
        })
        ?.fileDescription
        .content;
    assertDefined(content);
    return { original, emitted, dependency, content };
}

export async function assertImportedValueCase(input: ImportedValueCase): Promise<void> {
    const [ name, files, library, removed, retained, nativeError ] = input;
    const { original, emitted, dependency, content } = await valueComparison(files, library);
    const entry = { bundleName: 'package', targetFilePath: 'index.js', exportName: 'probe' };
    const native = await observeDeadCodeEliminationBehavior({ name, entry, bundles: [ original, dependency ] });
    assertDeepSubset(
        native[0]?.result.observation,
        { error: nativeError === null ? null : { name: nativeError } }
    );
    await assertDeadCodeEliminationBehaviorEquivalent({
        name,
        entry,
        leftName: 'native',
        leftBundles: [ original, dependency ],
        rightName: 'emitted',
        rightBundles: [ emitted, dependency ]
    });
    if (removed !== null) {
        assert.strictEqual(content.includes(removed), false);
    }
    if (retained !== null) {
        assert.strictEqual(content.includes(retained), true);
    }
}
