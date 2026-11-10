import assert from 'node:assert';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { primitiveSource } from '../transform/primitive-source.ts';
import { resolveRuntimeModule } from '../runtime-module-resolution.ts';
import { evaluateImportedConstant } from './imported-constant.ts';

type ImportMode = 'default' | 'named' | 'namespace';
const importStatements: Readonly<Record<ImportMode, string>> = {
    named: 'import {key} from "./library.js";',
    namespace: 'import * as library from "./library.js";',
    default: 'import key from "./library.js";'
};

suite('imported constant properties', function () {
    test('preserves primitive values through named, namespace, and default imports', function () {
        const values = fastCheck.oneof(
            fastCheck.double(),
            fastCheck.constantFrom(-0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
            fastCheck.string({ maxLength: 32 }),
            fastCheck.boolean(),
            fastCheck.constant(null),
            fastCheck.constant(undefined)
        );
        fastCheck.assert(
            fastCheck.property(
                values,
                fastCheck.constantFrom<ImportMode>('named', 'namespace', 'default'),
                function (value, mode) {
                    const literal = primitiveSource({ value });
                    const expression = mode === 'namespace' ? 'library.key' : 'key';
                    const library = mode === 'default' ? `export default ${literal};` : `export const key=${literal};`;
                    const project = createProject({
                        withFiles: [
                            { filePath: '/repo/package.json', content: '{"type":"module"}' },
                            {
                                filePath: '/repo/index.js',
                                content: `${importStatements[mode]}const unused={[${expression}]:1};`
                            },
                            { filePath: '/repo/library.js', content: library }
                        ]
                    });
                    const key = project
                        .getSourceFileOrThrow('/repo/index.js')
                        .getFirstDescendantByKindOrThrow(SyntaxKind.ComputedPropertyName)
                        .getExpression();
                    const result = evaluateImportedConstant(key, resolveRuntimeModule);
                    assertDefined(result);
                    assert.strictEqual(result.value, value);
                }
            ),
            { numRuns: 25 }
        );
    });
});
