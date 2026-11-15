import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createProject } from '../../test-libraries/typescript-project.ts';
import { createSourcePreparation } from '../../source-transformation/source-preparation.ts';
import { createExpressionPurityChecker } from '../pure-expression.ts';
import { removeUnusedValues } from './unused-values.ts';

suite('unused values', function () {
    suite('traversal boundaries', function () {
        for (
            const [ statement, expected ] of [
                [ 'pure(first(),second());', '(first());(second());' ],
                [ 'if(condition)pure(first(),second());', 'if(condition){ (first());(second()); }' ]
            ]
        ) {
            test(`preserves ordered argument effects in ${statement}`, function () {
                const declaration = 'function pure(value){return value;}';
                const source = createProject().createSourceFile('input.ts', declaration + statement);
                removeUnusedValues(
                    createSourcePreparation(source),
                    createExpressionPurityChecker(undefined, function () {
                        return undefined;
                    })
                );
                assert.strictEqual(source.getFullText(), declaration + expected);
            });
        }

        for (
            const content of [
                'const hidden=effect();eval("hidden");',
                '"use strict";export function value(){return 42;}'
            ]
        ) {
            test(`preserves dynamic bindings and directives in ${content}`, function () {
                const source = createProject().createSourceFile('input.ts', content);
                removeUnusedValues(
                    createSourcePreparation(source),
                    createExpressionPurityChecker(undefined, function () {
                        return undefined;
                    })
                );
                assert.strictEqual(source.getFullText(), content);
            });
        }

        test('removes unused values inside an exported function body', function () {
            const source = createProject().createSourceFile(
                'input.ts',
                'export function use(){const unused=1;return 42;}'
            );
            removeUnusedValues(
                createSourcePreparation(source),
                createExpressionPurityChecker(undefined, function () {
                    return undefined;
                })
            );
            assert.doesNotMatch(source.getFullText(), /unused/u);
            assert.match(source.getFullText(), /return 42/u);
        });
    });

    suite('unused uninitialized bindings', function () {
        test('retains an unknown initializer effect without its unused binding', function () {
            const source = createProject().createSourceFile('input.js', 'const unused=unknown();export{};');
            removeUnusedValues(
                createSourcePreparation(source),
                createExpressionPurityChecker(undefined, function () {
                    return undefined;
                })
            );
            assert.strictEqual(source.getFullText(), '(unknown());export{};');
        });

        test('removes an unused pure class initializer', function () {
            const source = createProject().createSourceFile('input.js', 'const unused=class{};export{};');
            removeUnusedValues(
                createSourcePreparation(source),
                createExpressionPurityChecker(undefined, function () {
                    return undefined;
                })
            );
            assert.strictEqual(source.getFullText(), ';export{};');
        });

        test('removes unused trusted pure construction', function () {
            const content = 'const unused=new Trusted();export{};';
            const source = createProject().createSourceFile('input.js', content);
            removeUnusedValues(
                createSourcePreparation(source),
                createExpressionPurityChecker({
                    enabled: true,
                    pureConstructors: [ 'Trusted' ]
                }, function () {
                    return undefined;
                })
            );
            assert.strictEqual(source.getFullText(), ';export{};');
        });

        for (
            const content of [
                '({...unknown});',
                '({[unknown]:effect()});',
                '({named:class{static{effect(this.name);}}});'
            ]
        ) {
            test(`keeps stable retained creation unchanged for ${content}`, function () {
                const source = createProject().createSourceFile('input.js', content);
                const preparation = createSourcePreparation(source);
                removeUnusedValues(
                    preparation,
                    createExpressionPurityChecker(undefined, function () {
                        return undefined;
                    })
                );
                assert.strictEqual(source.getFullText(), content);
                assert.deepStrictEqual(preparation.transformations, []);
            });
        }

        test('does not plan edits inside a removed function initializer', function () {
            const source = createProject().createSourceFile(
                'input.ts',
                'const unused=(effect(),()=>{const nested=sideEffect();});export const value=42;'
            );
            removeUnusedValues(
                createSourcePreparation(source),
                createExpressionPurityChecker(undefined, function () {
                    return undefined;
                })
            );
            assert.strictEqual(source.getFullText(), '(effect());export const value=42;');
        });

        test('drops an unused declarator while retaining an observed sibling', function () {
            const source = createProject().createSourceFile(
                'input.ts',
                'const unused=1, kept=unknown();consume(kept);'
            );
            removeUnusedValues(
                createSourcePreparation(source),
                createExpressionPurityChecker(undefined, function () {
                    return undefined;
                })
            );
            assert.strictEqual(source.getFullText(), ';const kept=unknown();consume(kept);');
        });

        for (const kind of [ 'let', 'var' ]) {
            test(`removes unused ${kind} declarations without an initializer`, function () {
                const source = createProject().createSourceFile('input.ts', `${kind} unused;export const value=42;`);
                removeUnusedValues(
                    createSourcePreparation(source),
                    createExpressionPurityChecker(undefined, function () {
                        return undefined;
                    })
                );
                assert.strictEqual(source.getFullText(), ';export const value=42;');
            });

            test(`retains observed ${kind} declarations without an initializer`, function () {
                const content = `${kind} value;export function read(){return value;}`;
                const source = createProject().createSourceFile('input.ts', content);
                const preparation = createSourcePreparation(source);
                removeUnusedValues(
                    preparation,
                    createExpressionPurityChecker(undefined, function () {
                        return undefined;
                    })
                );
                assert.strictEqual(source.getFullText(), content);
                assert.deepStrictEqual(preparation.transformations, []);
            });
        }
    });

    suite('unused class declarations', function () {
        for (
            const [ content, expected ] of [
                [ 'class Empty{}export{};', ';export{};' ],
                [ 'function probe(){class Empty{}return 42;}', 'function probe(){;return 42;}' ],
                [ 'class Empty{constructor(){effect();}}export{};', ';export{};' ],
                [ 'class Empty{get value(){effect();}}export{};', ';export{};' ],
                [ 'class Empty extends null{}export{};', ';export{};' ],
                [ 'class Empty{}"use strict";', ';"use strict";' ],
                [
                    'function probe(){class Empty{}"use strict";return this;}',
                    'function probe(){;"use strict";return this;}'
                ],
                [
                    'class Required{static value=effect();}export{};',
                    'class Required{static value=effect();}export{};'
                ],
                [ 'class Required{static{effect();}}export{};', 'class Required{static{effect();}}export{};' ],
                [ 'class Required{[key](){}}export{};', 'class Required{[key](){}}export{};' ],
                [ 'class Required extends unknown{}export{};', 'class Required extends unknown{}export{};' ],
                [ 'class Used{}consume(Used);', 'class Used{}consume(Used);' ],
                [ 'export class Kept{}', 'export class Kept{}' ],
                [ 'export default class{}', 'export default class{}' ],
                [ 'export default class{}const unused=1;', 'export default class{};' ],
                [ 'declare class Ambient{}', 'declare class Ambient{}' ],
                [ 'class {}', 'class {}' ],
                [ 'class Incomplete{', 'class Incomplete{' ],
                [ 'class Duplicate{}let Duplicate;', 'class Duplicate{}let Duplicate;' ],
                [ 'class Duplicate{}class Duplicate{}', 'class Duplicate{}class Duplicate{}' ]
            ]
        ) {
            test(`preserves declaration boundaries in ${content}`, function () {
                const source = createProject().createSourceFile('input.ts', content);
                removeUnusedValues(
                    createSourcePreparation(source),
                    createExpressionPurityChecker(undefined, function () {
                        return undefined;
                    })
                );
                assert.strictEqual(source.getFullText(), expected);
            });
        }
    });

    suite('persisted class declarations', function () {
        for (const extension of [ 'js', 'ts' ]) {
            for (const content of [ 'class Empty{}export{};', 'class Duplicate{}class Duplicate{}' ]) {
                test(`preserves stored input for ${content} in ${extension}`, async function () {
                    const source = createProject().createSourceFile(`input.${extension}`, content);
                    await source.save();
                    removeUnusedValues(
                        createSourcePreparation(source),
                        createExpressionPurityChecker(undefined, function () {
                            return undefined;
                        })
                    );
                    assert.strictEqual(
                        source.getFullText(),
                        content.startsWith('class Empty') ? ';export{};' : content
                    );
                    assert.strictEqual(
                        await source.getProject().getFileSystem().readFile(source.getFilePath()),
                        content
                    );
                });
            }
        }
    });
});
