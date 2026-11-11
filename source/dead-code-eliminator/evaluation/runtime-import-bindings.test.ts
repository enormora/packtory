import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { runtimeImportBindings } from './runtime-import-bindings.ts';

suite('runtime import bindings', function () {
    for (
        const [ content, expected ] of [
            [ 'import type Default from "module";', [] ],
            [ 'import Default from "module";', [ 'Default' ] ],
            [ 'import type * as ns from "module";', [] ],
            [ 'import * as ns from "module";', [ '* as ns' ] ],
            [ 'import {type Type,Value as local} from "module";', [ 'Value as local' ] ],
            [ 'import Default,* as ns from "module";', [ 'Default,* as ns', '* as ns' ] ],
            [ 'import "module";', [] ]
        ] as const
    ) {
        test(`selects initialized runtime bindings from ${content}`, function () {
            const source = createProject().createSourceFile('input.ts', content);
            const declaration = source.getFirstDescendantByKindOrThrow(SyntaxKind.ImportDeclaration);
            assert.deepStrictEqual(
                Array.from(runtimeImportBindings(declaration), function (binding) {
                    return binding.getText();
                }),
                expected
            );
        });
    }
});
