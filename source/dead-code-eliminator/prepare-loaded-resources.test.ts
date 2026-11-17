import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../test-libraries/typescript-project.ts';
import { bundleResource } from '../test-libraries/bundle-fixtures.ts';
import { bundleForCodeFile, inputs } from '../test-libraries/eliminator-test-support.ts';
import { assertDefined } from '../test-libraries/deep-subset-assertion.ts';
import { createSourceEvaluation } from './evaluation/constant-evaluation.ts';
import { loadResources } from './load-resource.ts';
import { prepareLoadedResources } from './prepare-loaded-resources.ts';

suite('loaded resource preparation', function () {
    test('uses linked module origins to reduce imported computations', function () {
        const projects = { runtime: createProject(), declarations: createProject() };
        const bundle = bundleForCodeFile({
            name: 'package',
            inputFilePath: '/source/index.js',
            targetFilePath: 'index.js',
            content: 'import {value} from "./dependency.js";export const result=value+1;',
            extraResources: [ {
                ...bundleResource('/source/dependency.js', { content: 'export const value=41;' }),
                isSubstituted: false
            } ]
        });
        const input = inputs(bundle)[0];
        assertDefined(input);
        const loaded = loadResources(projects.runtime, projects.declarations, bundle.contents, false);
        const prepared = prepareLoadedResources(loaded, input, undefined);
        const source = prepared[0]?.sourceFile;
        assertDefined(source);
        const expression = source.getVariableDeclarationOrThrow('result').getInitializerOrThrow();
        assert.deepStrictEqual(createSourceEvaluation(source).primitiveValue(expression), { value: 42 });
    });
});
