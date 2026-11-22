import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createSourcePreparation } from '../../source-transformation/source-preparation.ts';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { simplifyConstantControlFlow } from './constant-control-flow.ts';

suite('switch reduction convergence', function () {
    for (const declaration of [ 'enum Value{member=42}', 'namespace Value{export const member=42;}' ]) {
        test(`preserves named TypeScript bindings in ${declaration}`, function () {
            const content = `function probe(){switch(2){case 1:${declaration};break;case 2:return Value;}}`;
            const source = createProject().createSourceFile('input.ts', content);
            simplifyConstantControlFlow(createSourcePreparation(source));
            assert.strictEqual(source.getFullText(), content);
        });
    }

    test('preserves mappings for an already selected switch with a conditional break', function () {
        const content = 'function probe(value){switch(0){default:if(value)break;return 42;}}';
        const source = createProject().createSourceFile('input.js', content);
        const preparation = createSourcePreparation(source);
        simplifyConstantControlFlow(preparation);
        assert.strictEqual(source.getFullText(), content);
        assert.deepStrictEqual(preparation.transformations, []);
    });
    for (
        const [ body, expected ] of [
            [ 'switch(2){case 1:first();break;case 2:second();break;default:other();}', '{second();}' ],
            [ 'switch(3){case 1:first();break;default:other();}', '{other();}' ],
            [ 'switch(2){default:other();case 1:first();break;case 2:second();break;}', '{second();}' ],
            [ 'switch(3){case 1:first();break;}', '{}' ],
            [
                'outer:{switch(2){case 1:first();break;case 2:break outer;}second();}',
                'outer:{{break outer;}}'
            ],
            [ 'switch(value){case 1:first();break;}', 'switch(value){case 1:first();break;}' ]
        ]
    ) {
        test(`selects only the reachable statements in ${body}`, function () {
            const source = createProject().createSourceFile('input.js', `function probe(){${body}}`);
            simplifyConstantControlFlow(createSourcePreparation(source));
            assert.strictEqual(source.getFullText(), `function probe(){${expected}}`);
        });
    }
});
