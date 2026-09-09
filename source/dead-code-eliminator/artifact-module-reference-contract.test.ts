import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { suite, test } from 'mocha';
import { bundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { inputs } from '../test-libraries/eliminator-test-support.ts';
import type { ArtifactModuleReference, BundleResource } from '../resource-resolver/resolved-bundle.ts';

function runtimeResource(
    content: string,
    moduleReferences: readonly ArtifactModuleReference[]
): BundleResource & { readonly isSubstituted: false; } {
    return {
        ...bundleResource('/src/index.js', { content, moduleReferences, targetFilePath: 'index.js' }),
        isSubstituted: false
    };
}

async function productionFilesIn(folder: string): Promise<readonly string[]> {
    const names = await fs.promises.readdir(folder);
    return names
        .filter(function (name) {
            return name.endsWith('.ts') && !name.endsWith('.test.ts');
        })
        .map(function (name) {
            return path.join(folder, name);
        });
}

suite('artifact module reference contract', function () {
    test('dead code elimination rejects emitted module literals without artifact references', async function () {
        const eliminator = createTestEliminator();
        const bundle = linkedBundle({
            name: 'pkg',
            contents: [
                runtimeResource(
                    [
                        'export { shared } from "./shared.js";',
                        'export async function load() { return import("./lazy.js"); }',
                        'export const resolved = import.meta.resolve("./data.json");'
                    ]
                        .join('\n'),
                    []
                )
            ]
        });

        await assert.rejects(
            async function () {
                await eliminator.eliminate(inputs(bundle));
            },
            /pkg: index\.js is missing artifact module reference for "\.\/shared\.js"[\s\S]+pkg: index\.js is missing artifact module reference for "\.\/lazy\.js"[\s\S]+pkg: index\.js is missing artifact module reference for "\.\/data\.json"/u
        );
    });

    test('dead code elimination rejects emitted module literals with only wrong artifact references', async function () {
        const eliminator = createTestEliminator();
        const bundle = linkedBundle({
            name: 'pkg',
            contents: [
                runtimeResource(
                    'export { shared } from "./shared.js";\n',
                    [
                        {
                            type: 'local-code',
                            sourceSpecifier: './other.js',
                            emittedSpecifier: './other.js',
                            targetFilePath: 'other.js'
                        }
                    ]
                )
            ]
        });

        await assert.rejects(
            async function () {
                await eliminator.eliminate(inputs(bundle));
            },
            /pkg: index\.js is missing artifact module reference for "\.\/shared\.js"/u
        );
    });

    test('dead code elimination allows node builtins without artifact references', async function () {
        const eliminator = createTestEliminator();
        const bundle = linkedBundle({
            name: 'pkg',
            contents: [ runtimeResource('import fs from "node:fs";\nexport const api = fs.existsSync;\n', []) ]
        });

        const [ analyzed ] = await eliminator.eliminate(inputs(bundle));

        assert.strictEqual(analyzed?.contents[0]?.fileDescription.content.includes('node:fs'), true);
    });

    test('reachability walkers do not resolve module specifiers with path operations', async function () {
        const files = [
            ...await productionFilesIn('source/dead-code-eliminator/reachability'),
            ...await productionFilesIn('source/dead-code-eliminator/cross-bundle')
        ];
        const offenders: string[] = [];
        for (const filePath of files) {
            const content = await fs.promises.readFile(filePath, 'utf8');
            if (/from ['"]node:path['"]|path\.(?:join|resolve|dirname)|\bdirname\(/u.test(content)) {
                offenders.push(filePath);
            }
        }

        assert.deepStrictEqual(offenders, []);
    });
});
