import assert from 'node:assert';
import { suite, test } from 'mocha';
import { bundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { inputs } from '../test-libraries/eliminator-test-support.ts';
import { createProject } from '../test-libraries/typescript-project.ts';
import type { AnalyzedBundle } from './analyzed-bundle.ts';

function consumerDiagnostics(bundle: AnalyzedBundle, content: string): readonly number[] {
    const project = createProject({
        withFiles: [
            ...bundle.contents.map(function (resource) {
                return {
                    filePath: `/package/${resource.fileDescription.targetFilePath}`,
                    content: resource.fileDescription.content
                };
            }),
            { filePath: '/package/package.json', content: '{"type":"module"}' },
            { filePath: '/package/consumer.ts', content }
        ]
    });
    const consumer = project.getSourceFileOrThrow('/package/consumer.ts');
    return project.getProgram().getSemanticDiagnostics(consumer).map(function (diagnostic) {
        return diagnostic.getCode();
    });
}

suite('eliminator declaration consumers', function () {
    test('preserves positive consumers and rejects invalid arguments and missing exports', async function () {
        const runtime = bundleResource('/source/index.js', {
            content: 'export { api } from "./feature.js";'
        });
        const declaration = bundleResource('/source/index.d.ts', {
            content: 'export { api, type Options } from "./feature.js";'
        });
        const bundle = linkedBundle({
            name: 'package',
            roots: { main: { javaScript: runtime.fileDescription, declarationFile: declaration.fileDescription } },
            contents: [
                runtime,
                declaration,
                bundleResource('/source/feature.js', {
                    content: 'export function api(options) { return options.value; } const unused = 1;'
                }),
                bundleResource('/source/feature.d.ts', {
                    content:
                        'export interface Options { readonly value: number; } export declare function api(options: Options): number;'
                })
            ]
                .map(function (resource) {
                    return { ...resource, isSubstituted: false };
                })
        });
        const [ eliminated ] = await createTestEliminator().eliminate(inputs(bundle));
        assert.notStrictEqual(eliminated, undefined);
        if (eliminated === undefined) {
            assert.fail('expected emitted declarations');
        }
        assert.deepStrictEqual(
            consumerDiagnostics(
                eliminated,
                'import { api, type Options } from "./index.js"; const options: Options = { value: 7 }; const result: number = api(options);'
            ),
            []
        );
        assert.deepStrictEqual(
            consumerDiagnostics(eliminated, 'import { api } from "./index.js"; api({ value: "wrong" });'),
            [ 2322 ]
        );
        assert.deepStrictEqual(consumerDiagnostics(eliminated, 'import { missing } from "./index.js"; missing();'), [
            2305
        ]);
    });
});
