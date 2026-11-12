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

type RemovalEvents = {
    readonly plan: RemovalPlan;
    readonly events: readonly unknown[];
};

function recordingPlan(survivingNames: ReadonlySet<string>): RemovalEvents {
    const events: unknown[] = [];
    return {
        events,
        plan: {
            ...removalPlan(survivingNames),
            trace: {
                collector: {
                    record(event: unknown) {
                        events.push(event);
                    }
                }
            }
        }
    };
}

type CompilerWork = { readonly modifications: number; readonly batches: number; };
type ObservedSource = {
    readonly source: ReturnType<typeof withSource>;
    readonly work: () => CompilerWork;
};

function observeSource(content: string): ObservedSource {
    const source = withSource(content);
    let modifications = 0;
    let batches = 0;
    source.onModified(function () {
        modifications += 1;
    });
    return {
        source: new Proxy(source, {
            get(target, property) {
                const member: unknown = Reflect.get(target, property);
                if (typeof member !== 'function') {
                    return member;
                }
                return function (...parameters: readonly unknown[]): unknown {
                    if (property === 'removeStatements') {
                        batches += 1;
                    }
                    return Reflect.apply(member, target, parameters);
                };
            }
        }),
        work() {
            return { modifications, batches };
        }
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
            const { plan, events: removed } = recordingPlan(new Set());
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

    test('bounds compiler edits by contiguous removal groups while preserving binding traces', function () {
        const { source, work } = observeSource([
            'const dropFirst=1;',
            'const dropSecond=2;',
            'function dropFunction(){}',
            'const keepFirst=3;',
            'const dropThird=4;',
            'const dropFourth=5;',
            'const keepSecond=6;',
            'const dropFifth=7;',
            'const dropSixth=8;'
        ]
            .join('\n'));
        const { plan, events } = recordingPlan(new Set([ 'keepFirst', 'keepSecond' ]));
        processStatements(source, plan);
        assert.deepStrictEqual(
            source.getStatements().map(function (statement) {
                return statement.getText();
            }),
            [
                'const keepFirst=3;',
                'const keepSecond=6;'
            ]
        );
        assert.deepStrictEqual(
            events,
            [ 'dropFirst', 'dropSecond', 'dropFunction', 'dropThird', 'dropFourth', 'dropFifth', 'dropSixth' ].map(
                function (name) {
                    return {
                        type: 'binding-removed',
                        bundleName: 'package',
                        bindingIdentifier: `index.ts::${name}`,
                        inputFilePath: 'index.ts'
                    };
                }
            )
        );
        assert.ok(work().modifications <= 3);
        assert.ok(work().batches <= 3);
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
        const { plan, events } = recordingPlan(new Set([ 'a' ]));
        processStatements(sourceFile, plan);

        assert.strictEqual(sourceFile.getFullText(), 'const a = 1;');
        assert.deepStrictEqual(events, [ {
            type: 'binding-removed',
            bundleName: 'package',
            bindingIdentifier: 'index.ts::b',
            inputFilePath: 'index.ts'
        } ]);
    });

    test('keeps expression statements unchanged', function () {
        const sourceFile = withSource('console.log("hi");');
        processStatements(sourceFile, removalPlan(new Set<string>()));
        assert.strictEqual(sourceFile.getFullText(), 'console.log("hi");');
    });
});
