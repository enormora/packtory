import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../test-libraries/typescript-project.ts';
import { resolveRuntimeModule } from './runtime-module-resolution.ts';
import { resolveComputedPropertyKey } from './computed-property-key-purity.ts';

suite('imported computed property keys', function () {
    for (
        const [ declaration, expected ] of [
            [ 'export const key=42;', '42' ],
            [ 'export const key=undefined;', 'undefined' ],
            [ 'export const key=9007199254740993n;', '9007199254740993' ],
            [ 'export const key=consume();', undefined ],
            [ 'export let key="name";', undefined ]
        ] as const
    ) {
        test(`requires a proven immutable key for ${declaration}`, function () {
            const project = createProject({
                withFiles: [
                    { filePath: '/source/package.json', content: '{"type":"module"}' },
                    { filePath: '/source/provider.js', content: declaration },
                    {
                        filePath: '/source/index.js',
                        content: 'import {key} from "./provider.js";const value={[key]:1};'
                    }
                ]
            });
            const key = project
                .getSourceFileOrThrow('/source/index.js')
                .getFirstDescendantByKindOrThrow(SyntaxKind.ComputedPropertyName)
                .getExpression();
            assert.strictEqual(resolveComputedPropertyKey(key, resolveRuntimeModule), expected);
        });
    }
});
