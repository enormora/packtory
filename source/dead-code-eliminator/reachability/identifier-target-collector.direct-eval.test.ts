import assert from 'node:assert';
import { suite, test } from 'mocha';
import { multiFileBindingsFor } from '../../test-libraries/reachability-test-support.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { buildDeclarationNodeIndex } from './binding-identifier.ts';
import { collectIdentifierTargets } from './identifier-target-collector.ts';

suite('identifier-target-collector direct eval', function () {
    for (const expression of [ 'eval(source)', '(eval)(source)' ]) {
        test(`retains module bindings for a possibly builtin shadowed ${expression}`, function () {
            const files = multiFileBindingsFor([ {
                filePath: '/source/index.ts',
                content: `const hidden = 7; function probe(eval, source) { return ${expression}; }`
            } ]);
            const [ entry ] = files;
            assertDefined(entry);

            assert.deepStrictEqual(
                collectIdentifierTargets(
                    entry.sourceFile.getFunctionOrThrow('probe').getBodyOrThrow(),
                    buildDeclarationNodeIndex(files)
                ),
                new Set([ '/source/index.ts::hidden', '/source/index.ts::probe' ])
            );
        });
    }

    test('ignores module bindings absent from the declaration index', function () {
        const [ entry ] = multiFileBindingsFor([ {
            filePath: '/source/index.ts',
            content: 'const hidden = 7; function probe() { return eval("hidden"); }'
        } ]);
        assertDefined(entry);

        assert.deepStrictEqual(
            collectIdentifierTargets(
                entry.sourceFile.getFunctionOrThrow('probe').getBodyOrThrow(),
                buildDeclarationNodeIndex([])
            ),
            new Set()
        );
    });

    test('retains all namespace exports and module imports for direct eval', function () {
        const files = multiFileBindingsFor([
            {
                filePath: '/source/index.ts',
                content: [
                    'import defaultValue, { value as importedValue } from "./dep.ts";',
                    'import * as namespace from "./dep.ts";',
                    'const hidden = 7;',
                    'export function probe(source) { return eval(source); }'
                ]
                    .join('\n')
            },
            {
                filePath: '/source/dep.ts',
                content: 'const privateValue = 19; export const value = 11; export const other = 13; export default 17;'
            }
        ]);
        const [ entry ] = files;
        assertDefined(entry);

        assert.deepStrictEqual(
            collectIdentifierTargets(
                entry.sourceFile.getFunctionOrThrow('probe').getBodyOrThrow(),
                buildDeclarationNodeIndex(files)
            ),
            new Set([
                '/source/index.ts::defaultValue',
                '/source/index.ts::importedValue',
                '/source/index.ts::namespace',
                '/source/index.ts::hidden',
                '/source/index.ts::probe',
                '/source/dep.ts::value',
                '/source/dep.ts::other',
                '/source/dep.ts::default'
            ])
        );
    });
});
