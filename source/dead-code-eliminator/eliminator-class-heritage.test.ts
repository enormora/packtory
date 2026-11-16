import assert from 'node:assert';
import { suite, test } from 'mocha';
import { eliminateEntryModule } from '../test-libraries/eliminator-test-support.ts';
import { assertExpectedModuleExpression } from '../test-libraries/expected-module-source.ts';

suite('eliminator class heritage', function () {
    const invalidHeritage = [
        '3',
        'true',
        '"base"',
        'undefined',
        '{}',
        '() => {}',
        'async function () {}',
        'function* () {}',
        'async function* () {}',
        'class extends 3 {}'
    ];
    for (const heritage of invalidHeritage) {
        for (const prefix of [ 'class Unused', 'const unused = class' ]) {
            test(`preserves TypeError for ${prefix} extends ${heritage}`, async function () {
                const content = `${prefix} extends (${heritage}) {}; export const value = 42;`;
                assertExpectedModuleExpression(content, 'module.value');
                assertExpectedModuleExpression(await eliminateEntryModule(content), 'module.value');
            });
        }
    }
    for (const heritage of [ 'null', 'function () {}', 'class {}', 'class extends null {}' ]) {
        for (const prefix of [ 'class Unused', 'const unused = class' ]) {
            test(`removes ${prefix} with proven safe heritage ${heritage}`, async function () {
                const content = `${prefix} extends (${heritage}) {}; export const value = 42;`;
                const emitted = await eliminateEntryModule(content);
                assert.strictEqual(emitted.includes('class'), false);
                assertExpectedModuleExpression(content, 'module.value');
                assertExpectedModuleExpression(emitted, 'module.value');
            });
        }
    }
    for (
        const declaration of [
            'function Base() {} Base.prototype = 3; class Unused extends Base {}',
            'const Base = (() => {}).bind(null); class Unused extends Base {}',
            'class Unused extends Missing {}',
            'class Unused extends Unused {}',
            'class Unused extends Base {} class Base {}',
            'const unused = class { static { throw new Error(); } };',
            'class Unused extends (class { static { throw new Error(); } }) {}',
            'const unused = class { static value = missing(); };'
        ]
    ) {
        test(`preserves class definition errors in ${declaration}`, async function () {
            const content = `${declaration}; export const value = 42;`;
            assertExpectedModuleExpression(content, 'module.value');
            assertExpectedModuleExpression(await eliminateEntryModule(content), 'module.value');
        });
    }
});
