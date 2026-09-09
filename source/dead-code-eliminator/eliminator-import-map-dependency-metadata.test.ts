import assert from 'node:assert';
import { suite, test } from 'mocha';
import { bundleResource, externalDependency, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { inputs } from '../test-libraries/eliminator-test-support.ts';

suite('eliminator import-map dependency metadata', function () {
    test('eliminate ignores import-map specifiers in dependency metadata', async function () {
        const eliminator = createTestEliminator();
        const input = linkedBundle({
            name: 'a',
            contents: [
                {
                    ...bundleResource('/src/index.js', {
                        content: 'import { api } from "#internal";\nexport const value = api;\n',
                        moduleReferences: [
                            {
                                type: 'local-code',
                                sourceSpecifier: '#internal',
                                emittedSpecifier: '#internal',
                                targetFilePath: 'internal.js'
                            }
                        ],
                        targetFilePath: 'index.js'
                    }),
                    isSubstituted: false
                },
                {
                    ...bundleResource('/src/internal.js', {
                        content: 'export const api = 1;\n',
                        targetFilePath: 'internal.js'
                    }),
                    isSubstituted: false
                }
            ],
            externalDependencies: new Map([ [ '#internal', externalDependency('#internal') ] ]),
            linkedBundleDependencies: new Map(),
            substitutedInputFilePathsByPackageName: new Map()
        });

        const [ analyzed ] = await eliminator.eliminate(inputs(input));

        assert.deepStrictEqual(Array.from(analyzed?.externalDependencies.keys() ?? []), []);
    });
});
