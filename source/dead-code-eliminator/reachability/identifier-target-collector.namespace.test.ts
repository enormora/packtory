import assert from 'node:assert';
import { suite, test } from 'mocha';
import { multiFileBindingsFor } from '../../test-libraries/reachability-test-support.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { buildDeclarationNodeIndex } from './binding-identifier.ts';
import { collectIdentifierTargets } from './identifier-target-collector.ts';

suite('identifier-target-collector namespace', function () {
    for (
        const scenario of [
            { expression: 'ns.value', exports: [ 'value' ] },
            { expression: 'ns', exports: [ 'value', 'other' ] }
        ]
    ) {
        test(`collects exactly the dependencies of ${scenario.expression}`, function () {
            const files = multiFileBindingsFor([
                {
                    filePath: '/source/index.ts',
                    content:
                        `import * as ns from "./dep.ts"; export function probe() { return ${scenario.expression}; }`
                },
                {
                    filePath: '/source/dep.ts',
                    content: 'export const value = 1; export const other = 9; const privateValue = 7;'
                }
            ]);
            const [ entry ] = files;
            assertDefined(entry);
            const index = buildDeclarationNodeIndex(files);

            assert.deepStrictEqual(
                collectIdentifierTargets(entry.sourceFile.getFunctionOrThrow('probe').getBodyOrThrow(), index),
                new Set([
                    '/source/index.ts::ns',
                    ...scenario.exports.map(function (name) {
                        return `/source/dep.ts::${name}`;
                    })
                ])
            );
            const [ declaration ] = entry.sourceFile.getImportDeclarations();
            assertDefined(declaration);
            assert.deepStrictEqual(collectIdentifierTargets(declaration, index), new Set([ '/source/index.ts::ns' ]));
        });
    }
});
