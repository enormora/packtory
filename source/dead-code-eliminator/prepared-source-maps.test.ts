import assert from 'node:assert';
import { addMapping, GenMapping, toEncodedMap } from '@jridgewell/gen-mapping';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import { suite, test } from 'mocha';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import { buildLineIndex, offsetToLineColumn } from '../source-transformation/line-index.ts';
import { bundleForCodeFile, inputs } from '../test-libraries/eliminator-test-support.ts';
import { bundleResource } from '../test-libraries/bundle-fixtures.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';

function repeatedEffectBundle(): LinkedBundle {
    const content =
        'if (false) {\n console.log("same");\n}\nconst unused = console.log("same");\nexport const value = 42;\n//# sourceMappingURL=index.js.map';
    const map = new GenMapping({ file: 'index.js' });
    for (const generated of [ { line: 2, column: 1 }, { line: 4, column: 15 }, { line: 5, column: 0 } ]) {
        addMapping(map, { generated, source: 'original.ts', original: generated });
    }
    return bundleForCodeFile({
        name: 'package',
        inputFilePath: '/source/index.js',
        targetFilePath: 'index.js',
        content,
        extraResources: [ {
            ...bundleResource('/source/index.js.map', {
                targetFilePath: 'index.js.map',
                content: JSON.stringify(toEncodedMap(map))
            }),
            isSubstituted: false
        } ]
    });
}

suite('prepared source maps', function () {
    test('maps repeated retained effects to their original occurrence', async function () {
        const [ output ] = await createTestEliminator().eliminate(inputs(repeatedEffectBundle()));
        assertDefined(output);
        const emitted = output.contents.find(function (resource) {
            return resource.fileDescription.targetFilePath === 'index.js';
        });
        const emittedMap = output.contents.find(function (resource) {
            return resource.fileDescription.targetFilePath === 'index.js.map';
        });
        assertDefined(emitted);
        assertDefined(emittedMap);
        const generated = offsetToLineColumn(
            buildLineIndex(emitted.fileDescription.content),
            emitted.fileDescription.content.indexOf('console')
        );
        assert.deepStrictEqual(originalPositionFor(new TraceMap(emittedMap.fileDescription.content), generated), {
            source: 'original.ts',
            line: 4,
            column: 15,
            name: null
        });
    });
});
