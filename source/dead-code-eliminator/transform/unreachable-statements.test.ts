import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createSourcePreparation } from '../../source-transformation/source-preparation.ts';
import { translateGeneratedOffset } from '../../source-transformation/text-edits.ts';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { removeUnreachableStatements } from './unreachable-statements.ts';

suite('unreachable statements', function () {
    test('preserves original source lines after deleting nested unreachable statements', function () {
        const content = 'function probe(){return 42;{throw 1;unreachable();}}\nexport const kept=42;';
        const source = createProject().createSourceFile('input.js', content);
        const preparation = createSourcePreparation(source);
        removeUnreachableStatements(preparation);
        assert.strictEqual(preparation.originalLineFor(source.getVariableDeclarationOrThrow('kept')), 2);
        const [ transformation ] = preparation.transformations;
        assertDefined(transformation);
        assert.strictEqual(
            translateGeneratedOffset(content.indexOf('kept'), transformation.atoms),
            source.getVariableDeclarationOrThrow('kept').getStart()
        );
    });
    for (
        const content of [
            'function probe(){return 42;unreachable();}',
            'function probe(){{return 42;}unreachable();}',
            'function probe(){{effect();return 42;}unreachable();}',
            '{throw 42;unreachable();}',
            'function probe(){return 42;{throw 1;unreachable();}}',
            'function probe(value){if(value)return 42;else throw 1;unreachable();}',
            'function probe(){try{return 42;}finally{effect();}unreachable();}',
            'function probe(){try{effect();}finally{return 42;}unreachable();}',
            'function probe(){try{throw 1;}catch(error){return error;}unreachable();}',
            'function probe(){while(value){break;unreachable();}}',
            'function probe(){while(value){continue;unreachable();}}',
            'function probe(value){switch(value){case 1:break;unreachable();default:return 42;unreachable();}}'
        ]
    ) {
        test(`removes unreachable calls in ${content}`, function () {
            const source = createProject().createSourceFile('input.js', content);
            removeUnreachableStatements(createSourcePreparation(source));
            assert.strictEqual(source.getFullText().includes('unreachable'), false);
        });
    }

    for (
        const content of [
            'function probe(value){if(value)return 42;effect();}',
            'function probe(){try{throw 1;}catch(error){effect();}effect();}',
            'function probe(){try{effect();}finally{effect();}effect();}',
            'function probe(){while(value){break;}effect();}',
            'function probe(){label:{break label;}effect();}',
            'function probe(){return value;var value=effect();}',
            'function probe(){return value;let value=effect();}',
            'function probe(){return value;class value{}}',
            'function probe(){return value;enum value{answer=42}}',
            'function probe(){return value;namespace value{}}',
            'function probe(){return value();function value(){return 42;}}',
            'function probe(){return eval("value");let value=1;effect();}',
            'function probe(){return 42;}',
            'function probe(){return 42;;}',
            'function probe(){return 42;if(false){var value=effect();}}'
        ]
    ) {
        test(`preserves scope and reachable effects in ${content}`, function () {
            const source = createProject().createSourceFile('input.js', content);
            removeUnreachableStatements(createSourcePreparation(source));
            assert.strictEqual(source.getFullText(), content);
        });
    }
});
