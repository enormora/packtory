import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { ArtifactModuleReference, BundleResource } from '../resource-resolver/resolved-bundle.ts';
import { bundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { inputs } from '../test-libraries/eliminator-test-support.ts';

function runtimeResource(
    content: string,
    moduleReferences: readonly ArtifactModuleReference[]
): BundleResource & { readonly isSubstituted: false; } {
    return {
        ...bundleResource('/source/index.js', {
            content,
            moduleReferences,
            targetFilePath: 'index.js'
        }),
        isSubstituted: false
    };
}

suite('artifact module reference contract', function () {
    test('dead code elimination rejects emitted module literals without artifact references', async function () {
        const eliminator = createTestEliminator();
        const bundle = linkedBundle({
            name: 'package',
            contents: [ runtimeResource(
                [
                    'export { shared } from "./shared.js";',
                    'export async function load() { return import("./lazy.js"); }',
                    'export const resolved = import.meta.resolve("./data.json");'
                ]
                    .join('\n'),
                []
            ) ]
        });
        await assert.rejects(
            async function () {
                await eliminator.eliminate(inputs(bundle));
            },
            /package: index\.js is missing artifact module reference for "\.\/shared\.js"[\s\S]+package: index\.js is missing artifact module reference for "\.\/lazy\.js"[\s\S]+package: index\.js is missing artifact module reference for "\.\/data\.json"/u
        );
    });

    test('dead code elimination rejects emitted module literals with only wrong artifact references', async function () {
        const eliminator = createTestEliminator();
        const bundle = linkedBundle({
            name: 'package',
            contents: [ runtimeResource('export { shared } from "./shared.js";\n', [ {
                type: 'local-code',
                sourceSpecifier: './other.js',
                emittedSpecifier: './other.js',
                targetFilePath: 'other.js'
            } ]) ]
        });
        await assert.rejects(async function () {
            await eliminator.eliminate(inputs(bundle));
        }, /package: index\.js is missing artifact module reference for "\.\/shared\.js"/u);
    });

    test('dead code elimination allows node builtins without artifact references', async function () {
        const eliminator = createTestEliminator();
        const bundle = linkedBundle({
            name: 'package',
            contents: [ runtimeResource('import fs from "node:fs";\nexport const api = fs.existsSync;\n', []) ]
        });
        const [ analyzed ] = await eliminator.eliminate(inputs(bundle));
        assert.strictEqual(analyzed?.contents[0]?.fileDescription.content.includes('node:fs'), true);
    });
});
