import assert from 'node:assert';
import { suite, test } from 'mocha';
import { translateGeneratedOffset } from '../../source-transformation/text-edits.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { bundleResource } from '../../test-libraries/bundle-fixtures.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { classifySideEffects } from '../../test-libraries/side-effect-classifier-test-support.ts';
import { buildAnalyzedResource } from '../code-file-analyzer.ts';
import { loadResource } from '../load-resource.ts';
import { bindingIdentifier } from '../reachability/binding-identifier.ts';

suite('prepared source mappings', function () {
    test('retains argument locations when an identity call disappears', function () {
        const content = 'function identity(value){return value;}\nexport const value=identity({answer:42});';
        const loaded = loadResource(createProject(), createProject(), {
            ...bundleResource('/source/index.js', { content, targetFilePath: 'index.js' }),
            isSubstituted: false
        }, true);
        const result = buildAnalyzedResource(loaded, {
            bundleName: 'package',
            reachable: new Set([ bindingIdentifier('index.js', 'value') ]),
            survivingExports: new Map<string, ReadonlySet<string>>(),
            transformationsEnabled: true,
            deadCodeElimination: undefined,
            classifySideEffects,
            trace: undefined
        });
        const output = result.resource.fileDescription.content;
        assert.strictEqual(output.includes('identity'), false);
        assert.strictEqual(output.includes('(0, {answer:42})'), true);
        assert.strictEqual(
            result.transforms.reduce<number | undefined>(function (offset, { textTransform }) {
                assertDefined(offset);
                return translateGeneratedOffset(offset, textTransform.atoms);
            }, content.indexOf('answer')),
            output.indexOf('answer')
        );
    });

    test('maps retained code through specialization, branch pruning, and declaration removal', function () {
        const content =
            'if (false) {\nconsole.log("unreachable");\n}\nfunction compute(n) { return n * 2; }\nexport const value = compute(21);\nexport const tail = 9;';
        const loaded = loadResource(createProject(), createProject(), {
            ...bundleResource('/source/index.js', { content, targetFilePath: 'index.js' }),
            isSubstituted: false
        }, true);
        const result = buildAnalyzedResource(loaded, {
            bundleName: 'package',
            reachable: new Set([ bindingIdentifier('index.js', 'value'), bindingIdentifier('index.js', 'tail') ]),
            survivingExports: new Map<string, ReadonlySet<string>>(),
            transformationsEnabled: true,
            deadCodeElimination: undefined,
            classifySideEffects,
            trace: undefined
        });
        const firstTransform = result.transforms[0]?.textTransform;
        assertDefined(firstTransform);
        assert.strictEqual(result.resource.fileDescription.content.includes('compute'), false);
        assert.strictEqual(result.resource.fileDescription.content.includes('unreachable'), false);
        assert.strictEqual(result.resource.fileDescription.content.includes('(42)'), true);
        assert.strictEqual(firstTransform.originalCode, content);
        assert.strictEqual(
            result.transforms.reduce<number | undefined>(function (offset, { textTransform }) {
                assertDefined(offset);
                return translateGeneratedOffset(offset, textTransform.atoms);
            }, content.indexOf('tail')),
            result.resource.fileDescription.content.indexOf('tail')
        );
    });
});
