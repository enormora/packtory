import assert from 'node:assert';
import { suite, test } from 'mocha';
import { assertDefined } from '../../test-libraries/deep-subset-assertion.ts';
import { withSource } from '../../test-libraries/transform-test-support.ts';
import { processStatements, repairImportDeclarations, type RemovalPlan } from './declaration-removal.ts';

function removalPlan(survivingNames: ReadonlySet<string>): RemovalPlan {
    return {
        bundleName: 'package',
        inputFilePath: 'index.ts',
        targetFilePath: 'index.ts',
        survivingNames,
        survivingExportNames: undefined,
        trace: undefined
    };
}

suite('declaration-removal', function () {
    suite('change reporting', function () {
        test('reports no change when every declarator survives', function () {
            const source = withSource('const first=1,second=2;');
            processStatements(source, removalPlan(new Set([ 'first', 'second' ])));
            assert.strictEqual(source.getFullText(), 'const first=1,second=2;');
        });
        for (const content of [ 'export {};', 'const value=1;' ]) {
            test(`reports import repair changes accurately for ${content}`, function () {
                const source = withSource(content);
                assert.strictEqual(
                    repairImportDeclarations(source, removalPlan(new Set()), true),
                    content === 'const value=1;'
                );
                assert.strictEqual(repairImportDeclarations(source, removalPlan(new Set()), true), false);
            });
        }

        test('records every removed declarator', function () {
            const source = withSource('const first=1,second=2;');
            const removed: unknown[] = [];
            const plan = {
                ...removalPlan(new Set()),
                trace: {
                    collector: {
                        record(event: unknown) {
                            removed.push(event);
                        }
                    }
                }
            };
            processStatements(source, plan);
            assert.strictEqual(source.getFullText(), '');
            assert.deepStrictEqual(removed, [
                {
                    type: 'binding-removed',
                    bundleName: 'package',
                    bindingIdentifier: 'index.ts::first',
                    inputFilePath: 'index.ts'
                },
                {
                    type: 'binding-removed',
                    bundleName: 'package',
                    bindingIdentifier: 'index.ts::second',
                    inputFilePath: 'index.ts'
                }
            ]);
        });
    });

    test('processStatements removes a named declaration when its name is not in the surviving set', function () {
        const sourceFile = withSource('function keep() {}\nfunction drop() {}');

        processStatements(sourceFile, removalPlan(new Set([ 'keep' ])));

        assert.strictEqual(sourceFile.getFullText(), 'function keep() {}');
        assert.strictEqual(sourceFile.getFunction('drop'), undefined);
    });

    test('processStatements leaves a named declaration in place when it is in the surviving set', function () {
        const sourceFile = withSource('function keep() {}');

        processStatements(sourceFile, removalPlan(new Set([ 'keep' ])));

        assert.strictEqual(sourceFile.getFullText(), 'function keep() {}');
        assertDefined(sourceFile.getFunction('keep'));
    });

    test('processStatements drops only the non-surviving declarators inside a variable statement', function () {
        const sourceFile = withSource('const a = 1, b = 2;');
        processStatements(sourceFile, removalPlan(new Set([ 'a' ])));

        assert.strictEqual(sourceFile.getFullText(), 'const a = 1;');
    });

    test('keeps expression statements unchanged', function () {
        const sourceFile = withSource('console.log("hi");');
        processStatements(sourceFile, removalPlan(new Set<string>()));
        assert.strictEqual(sourceFile.getFullText(), 'console.log("hi");');
    });
});
