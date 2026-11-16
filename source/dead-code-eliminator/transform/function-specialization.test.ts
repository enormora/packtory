import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { createSourcePreparation } from '../../source-transformation/source-preparation.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { specializeExpressions } from './expression-specialization.ts';

suite('function body specialization', function () {
    for (
        const content of [
            'function value(){}',
            'function value(){return 42;}',
            'function value(){"use strict";return 42;}',
            'function value(){"one";"two";}',
            'const value=()=>42;'
        ]
    ) {
        test(`preserves trivial bodies and their source mappings in ${content}`, function () {
            const source = createProject().createSourceFile('input.js', content);
            const preparation = createSourcePreparation(source);
            specializeExpressions(preparation);
            assert.strictEqual(source.getFullText(), content);
            assert.deepStrictEqual(preparation.transformations, []);
        });
    }

    for (
        const [ body, statements ] of [
            [ '42;', [] ],
            [ ';', [] ],
            [ 'return result;var result=ignored();', [] ],
            [ 'return 42;var result=ignored();', [ 'return 42;' ] ],
            [ '"use strict";42;', [ '"use strict";' ] ]
        ] as const
    ) {
        test(`removes producing work in ${body}`, function () {
            const source = createProject().createSourceFile('input.js', `function value(){${body}}`);
            specializeExpressions(createSourcePreparation(source));
            const bodyStatements = source
                .getFunctionOrThrow('value')
                .getBodyOrThrow()
                .asKindOrThrow(SyntaxKind.Block)
                .getStatements();
            assert.deepStrictEqual(
                bodyStatements.map(function (statement) {
                    return statement.getText();
                }),
                statements
            );
        });
    }
});
