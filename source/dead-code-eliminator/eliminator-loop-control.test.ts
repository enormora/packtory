import assert from 'node:assert';
import { suite, test } from 'mocha';
import { SyntaxKind } from 'ts-morph';
import { eliminateEntryModule } from '../test-libraries/eliminator-test-support.ts';
import { withSource } from '../test-libraries/transform-test-support.ts';
import {
    assertExpressionEvaluation,
    type ExpressionEvaluationCase
} from '../test-libraries/expression-evaluation-case.ts';

const cases: readonly ExpressionEvaluationCase[] = [ {
    name: 'retains object binding initialization errors',
    content:
        'function compute(){let index=0;while(index<1){const {ignored}=null;index++;}return 42;}export const value=compute();',
    result: undefined
}, {
    name: 'retains array binding iterator errors',
    content:
        'function compute(){let index=0;while(index<1){const []={};index++;}return 42;}export const value=compute();',
    result: undefined
}, {
    name: 'retains an unknown branch condition',
    content: 'function compute(){while(true){if(missing)return 1;return 42;}}export const value=compute();',
    result: undefined
}, {
    name: 'retains effects from an unused local initializer',
    content:
        'let seen=0;function compute(){let index=0;while(index<1){const ignored=(seen=1);index++;}return 42;}export const value=compute()+seen;',
    result: undefined
}, {
    name: 'initializes every local declarator',
    content:
        'function compute(){let left=20,right=22;while(left<21)left++;return left+right;}export const value=compute();',
    result: {
        value: 43
    }
}, {
    name: 'retains effects from later local declarators',
    content:
        'let seen=0;function compute(){let index=0;while(index<1){const first=1,ignored=(seen=first);index++;}return 42;}export const value=compute()+seen;',
    result: undefined
}, {
    name: 'greatest common divisor',
    content:
        'function compute(left,right){while(right!==0){const remainder=left%right;left=right;right=remainder;}return left;}export const value=compute(1071,462);',
    result: {
        value: 21
    }
}, {
    name: 'while skips an unreachable body',
    content: 'function compute(){while(false){missing();}return 42;}export const value=compute();',
    result: {
        value: 42
    }
}, {
    name: 'do executes once before a false condition',
    content: 'function compute(){let count=0;do count++;while(false);return count;}export const value=compute();',
    result: {
        value: 1
    }
}, {
    name: 'do return skips the condition',
    content: 'function compute(){do{return 42;}while(missing);}export const value=compute();',
    result: {
        value: 42
    }
}, {
    name: 'do break skips the condition',
    content:
        'function compute(){let count=1;do{count++;break;}while(missing);return count;}export const value=compute();',
    result: {
        value: 2
    }
}, {
    name: 'do continue evaluates the condition',
    content:
        'function compute(){let count=0;do{count++;continue;}while(count<3);return count;}export const value=compute();',
    result: {
        value: 3
    }
}, {
    name: 'do continue preserves a condition exception',
    content: 'function compute(){do{continue;}while(missing);return 42;}export const value=compute();',
    result: undefined
}, {
    name: 'while continue skips the remaining body',
    content:
        'function compute(){let count=0;let total=0;while(count<6){count++;if(count%2===0)continue;total+=count;}return total;}export const value=compute();',
    result: {
        value: 9
    }
}, {
    name: 'for continue executes the increment',
    content:
        'function compute(){let total=0;for(let index=0;index<6;index++){if(index%2===0)continue;total+=index;}return total;}export const value=compute();',
    result: {
        value: 9
    }
}, {
    name: 'for break skips the increment and remaining body',
    content:
        'function compute(){let count=0;for(;true;missing()){count++;break;missing();}return count;}export const value=compute();',
    result: {
        value: 1
    }
}, {
    name: 'break exits only the inner loop',
    content:
        'function compute(){let total=0;for(let index=0;index<3;index++){let inner=0;while(inner<5){inner++;if(inner===2)break;total++;}total+=10;}return total;}' +
        'export const value=compute();',
    result: {
        value: 33
    }
}, {
    name: 'for initializer assigns an existing local',
    content:
        'function compute(){let index=99;let total=0;for(index=1;index<=3;index++)total+=index;return total*10+index;}export const value=compute();',
    result: {
        value: 64
    }
}, {
    name: 'for declarations preserve the outer binding',
    content:
        'function compute(){let index=99;let total=0;for(let index=1;index<=3;index++)total+=index;return total*100+index;}export const value=compute();',
    result: {
        value: 699
    }
}, {
    name: 'for without a condition exits through break',
    content:
        'function compute(){let count=0;for(;;){count++;if(count===5)break;}return count;}export const value=compute();',
    result: {
        value: 5
    }
}, {
    name: 'while preserves an unknown condition exception',
    content: 'function compute(){while(missing){return 42;}return 0;}export const value=compute();',
    result: undefined
}, {
    name: 'do preserves an observable first iteration',
    content:
        'let visits=0;function compute(){do{visits++;}while(false);return 42;}export const value=compute()+visits;',
    result: undefined
}, {
    name: 'for initializer effects precede a false condition',
    content:
        'let visits=0;function mark(){visits++;return 0;}function compute(){for(mark();false;){}return 42;}export const value=compute()+visits;',
    result: undefined
}, {
    name: 'for continue preserves increment effects',
    content:
        'let visits=0;function mark(){visits++;return 0;}function compute(){let count=0;for(;count<2;mark()){count++;continue;}return count;}export const value=compute()*10+visits;',
    result: undefined
}, {
    name: 'while propagates an early return',
    content:
        'function compute(value){let divisor=2;while(divisor*divisor<=value){if(value%divisor===0)return false;divisor++;}return value>=2;}export const value=compute(91);',
    result: {
        value: false
    }
}, {
    name: 'while preserves mutation through a record argument',
    content:
        'function advance(state){while(state.count<3)state.count++;return state.count;}function compute(){const state={count:0};advance(state);return state.count;}export const value=compute();',
    result: {
        value: 3
    }
}, {
    name: 'while uses an initialized module constant',
    content:
        'const limit=4;function compute(){let count=0;while(count<limit)count++;return count;}export const value=compute();',
    result: {
        value: 4
    }
}, {
    name: 'while preserves the evaluation budget',
    content: 'function compute(){let count=0;while(count<3000)count++;return count;}export const value=compute();',
    result: undefined
}, {
    name: 'do preserves the evaluation budget',
    content: 'function compute(){let count=0;do{count++;}while(count<3000);return count;}export const value=compute();',
    result: undefined
}, {
    name: 'labelled continue remains unproved',
    content:
        'function compute(){let count=0;outer:while(count<3){count++;continue outer;}return count;}export const value=compute();',
    result: undefined
}, {
    name: 'iterator execution remains unproved',
    content:
        'let visits=0;const iterable={[Symbol.iterator](){visits++;return [1,2][Symbol.iterator]();}};function compute(){let total=0;for(const item of iterable)total+=item;return total;}' +
        'export const value=compute()*10+visits;',
    result: undefined
}, {
    name: 'mutable captured conditions remain unproved',
    content: 'let limit=0;function compute(){while(limit<1){return 42;}return 0;}export const value=compute();',
    result: undefined
} ];

suite('bounded loop control', function () {
    for (const input of cases) {
        test(input.name, function () {
            assertExpressionEvaluation(input);
        });
    }

    test('retains an unproved loop result through the DCE pipeline', async function () {
        const source = withSource(
            await eliminateEntryModule(
                'function compute(){let count=0;while(count<3000)count++;return count;}export const value=compute();'
            )
        );
        const call = source.getVariableDeclarationOrThrow('value').getInitializerOrThrow().asKindOrThrow(
            SyntaxKind.CallExpression
        );
        assert.strictEqual(call.getExpression().getText(), 'compute');
        assert.notStrictEqual(
            source.getFunctionOrThrow('compute').getFirstDescendantByKind(SyntaxKind.WhileStatement),
            undefined
        );
        assert.deepStrictEqual(
            source.getExportSymbols().map(function (symbol) {
                return symbol.getName();
            }),
            [ 'value' ]
        );
    });
});
