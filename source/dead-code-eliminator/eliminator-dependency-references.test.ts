import assert from 'node:assert';
import { suite, test } from 'mocha';
import { bundleResource, externalDependency, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { inputs } from '../test-libraries/eliminator-test-support.ts';
import type { BundleResource } from '../resource-resolver/resolved-bundle.ts';

function transformedResource(content: string): BundleResource & { readonly isSubstituted: false; } {
    return {
        ...bundleResource('/src/index.js', { content, targetFilePath: 'index.js' }),
        isSubstituted: false
    };
}

suite('eliminator dependency references', function () {
    test('preserves a single dependency reference from surviving code', async function () {
        const eliminator = createTestEliminator();
        const input = linkedBundle({
            name: 'a',
            contents: [ transformedResource('import { api } from "dep";\nexport const value = api;\n') ],
            externalDependencies: new Map([ [ 'dep', externalDependency('dep', [ '/src/index.js' ]) ] ])
        });

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(analyzed?.externalDependencies.get('dep')?.references, [
            { sourceFilePath: '/src/index.js', sourceSpecifier: 'dep', emittedSpecifier: 'dep' }
        ]);
    });

    test('drops stale explicit dependency references for surviving packages', async function () {
        const eliminator = createTestEliminator();
        const input = linkedBundle({
            name: 'a',
            contents: [ transformedResource('import { api } from "dep/live";\nexport const value = api;\n') ],
            externalDependencies: new Map([ [
                'dep',
                {
                    name: 'dep',
                    referencedFrom: [ '/src/index.js' ],
                    references: [
                        {
                            sourceFilePath: '/src/index.js',
                            sourceSpecifier: 'dep/dead',
                            emittedSpecifier: 'dep/dead'
                        }
                    ]
                }
            ] ])
        });

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(Array.from(analyzed?.externalDependencies.keys() ?? []), []);
    });

    test('deduplicates dependency references by source path, source specifier, and emitted specifier', async function () {
        const eliminator = createTestEliminator();
        const input = linkedBundle({
            name: 'a',
            contents: [
                transformedResource(
                    'import live from "dep/live";\nimport alias from "dep/alias";\nexport { live, alias };\n'
                )
            ],
            externalDependencies: new Map([ [
                'dep',
                {
                    name: 'dep',
                    referencedFrom: [ '/src/index.js' ],
                    references: [
                        { sourceFilePath: '/src/index.js', sourceSpecifier: 'live-a', emittedSpecifier: 'dep/live' },
                        { sourceFilePath: '/src/index.js', sourceSpecifier: 'live-b', emittedSpecifier: 'dep/live' },
                        { sourceFilePath: '/src/index.js', sourceSpecifier: 'live-a', emittedSpecifier: 'dep/live' },
                        { sourceFilePath: '/src/index.js', sourceSpecifier: 'live-a', emittedSpecifier: 'dep/alias' }
                    ]
                }
            ] ])
        });

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(analyzed?.externalDependencies.get('dep')?.references, [
            { sourceFilePath: '/src/index.js', sourceSpecifier: 'live-a', emittedSpecifier: 'dep/live' },
            { sourceFilePath: '/src/index.js', sourceSpecifier: 'live-b', emittedSpecifier: 'dep/live' },
            { sourceFilePath: '/src/index.js', sourceSpecifier: 'live-a', emittedSpecifier: 'dep/alias' }
        ]);
    });
});
