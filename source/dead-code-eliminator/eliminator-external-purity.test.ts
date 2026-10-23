import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { Project } from 'ts-morph';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import { bundleForCodeFile, inputs, inputWithoutTransformations } from '../test-libraries/eliminator-test-support.ts';
import type { EliminationInput } from './analyzed-bundle.ts';
import { createDeadCodeEliminator } from './eliminator.ts';

const packageManifest = '{"type":"module","exports":"./index.js"}';
const pureBuilder = 'export function make() { return {}; }';
const entryContent = 'import { make } from "schema-lib";\nconst unused = make();\nexport const live = 42;';

function dependencyProject(): Project {
    return createProject({
        withFiles: [
            { filePath: '/repo/node_modules/schema-lib/package.json', content: packageManifest },
            { filePath: '/repo/node_modules/schema-lib/index.js', content: pureBuilder },
            { filePath: '/repo/nested/node_modules/schema-lib/package.json', content: packageManifest },
            {
                filePath: '/repo/nested/node_modules/schema-lib/index.js',
                content: 'export function make() { return compute(); }'
            },
            { filePath: '/repo/effects/node_modules/schema-lib/package.json', content: packageManifest },
            {
                filePath: '/repo/effects/node_modules/schema-lib/index.js',
                content: 'export function make() { console.log("effect"); return {}; }'
            }
        ]
    });
}

function packageInput(inputFilePath: string): EliminationInput {
    const [ input ] = inputs(bundleForCodeFile({
        name: inputFilePath,
        inputFilePath,
        targetFilePath: 'index.js',
        content: entryContent
    }));
    assertDefined(input);
    return input;
}

async function eliminatePackages(packages: readonly EliminationInput[]): Promise<readonly string[]> {
    const eliminator = createDeadCodeEliminator({
        createProject: dependencyProject,
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
    const analyzed = await eliminator.eliminate(packages);
    return analyzed.map(function (bundle) {
        assert.strictEqual(bundle.contents.length, 1);
        const [ entry ] = bundle.contents;
        assertDefined(entry);
        assert.strictEqual(entry.fileDescription.content.includes('export const live = 42'), true);
        return entry.fileDescription.content;
    });
}

suite('external dependency purity during elimination', function () {
    test('removes unused pure initializers using dependencies beside the original file', async function () {
        const [ content ] = await eliminatePackages([ packageInput('/repo/build/index.js') ]);

        assertDefined(content);
        assert.strictEqual(content.includes('unused'), false);
    });

    test('resolves the nearest dependency independently for each bundle', async function () {
        const [ pure, unknown ] = await eliminatePackages([
            packageInput('/repo/build/index.js'),
            packageInput('/repo/nested/build/index.js')
        ]);

        assertDefined(pure);
        assertDefined(unknown);
        assert.strictEqual(pure.includes('unused'), false);
        assert.strictEqual(unknown.includes('const unused = make()'), true);
    });

    test('preserves initializers when transformations are disabled', async function () {
        const input = packageInput('/repo/build/index.js');
        const [ content ] = await eliminatePackages(inputWithoutTransformations(input.bundle));

        assert.strictEqual(content, entryContent);
    });

    test('preserves calls to dependency functions with observable effects', async function () {
        const [ content ] = await eliminatePackages([ packageInput('/repo/effects/build/index.js') ]);

        assertDefined(content);
        assert.strictEqual(content.includes('const unused = make()'), true);
    });

    test('does not use installed dependency summaries for linked sibling imports', async function () {
        const input = packageInput('/repo/build/index.js');
        const contents = input.bundle.contents.map(function (resource) {
            return {
                ...resource,
                moduleReferences: resource.moduleReferences.map(function (reference) {
                    return {
                        ...reference,
                        type: 'linked-code' as const,
                        packageName: 'schema-lib',
                        targetFilePath: 'index.js'
                    };
                })
            };
        });
        const [ content ] = await eliminatePackages([ { ...input, bundle: { ...input.bundle, contents } } ]);

        assertDefined(content);
        assert.strictEqual(content.includes('const unused = make()'), true);
    });
});
