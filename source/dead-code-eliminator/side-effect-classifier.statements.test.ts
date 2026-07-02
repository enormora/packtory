import assert from 'node:assert';
import { suite, test } from 'mocha';
import { classify } from '../test-libraries/side-effect-classifier-test-support.ts';

suite('side-effect-classifier statements', function () {
    suite('side-effect-classifier expression statements', function () {
        test('treats a top-level call as an impure expression statement', function () {
            assert.deepStrictEqual(classify('console.log("hi");'), [ { line: 1, kind: 'expression statement' } ]);
        });

        test('treats a top-level IIFE as an impure expression statement', function () {
            assert.deepStrictEqual(classify('(function() { return 1; })();'), [ {
                line: 1,
                kind: 'expression statement'
            } ]);
        });

        test('treats a top-level if statement as impure', function () {
            assert.deepStrictEqual(classify('if (true) { console.log(1); }'), [ { line: 1, kind: 'if statement' } ]);
        });

        test('treats a top-level for statement as impure', function () {
            assert.deepStrictEqual(classify('for (let i = 0; i < 1; i++) { console.log(i); }'), [
                { line: 1, kind: 'for statement' }
            ]);
        });

        test('treats a top-level for-in statement as impure', function () {
            assert.deepStrictEqual(classify('for (const k in {}) { console.log(k); }'), [
                { line: 1, kind: 'for-in statement' }
            ]);
        });
    });

    suite('side-effect-classifier loop statements', function () {
        test('treats a top-level for-of statement as impure', function () {
            assert.deepStrictEqual(classify('for (const v of []) { console.log(v); }'), [
                { line: 1, kind: 'for-of statement' }
            ]);
        });

        test('treats a top-level while statement as impure', function () {
            assert.deepStrictEqual(classify('while (false) { break; }'), [ { line: 1, kind: 'while statement' } ]);
        });

        test('treats a top-level do-while statement as impure', function () {
            assert.deepStrictEqual(classify('do { break; } while (false);'), [ {
                line: 1,
                kind: 'do-while statement'
            } ]);
        });

        test('treats a top-level switch statement as impure', function () {
            assert.deepStrictEqual(classify('switch (1) { case 1: break; }'), [ {
                line: 1,
                kind: 'switch statement'
            } ]);
        });
    });

    suite('side-effect-classifier control statements', function () {
        test('treats a top-level try statement as impure', function () {
            assert.deepStrictEqual(classify('try { } catch (e) { }'), [ { line: 1, kind: 'try statement' } ]);
        });

        test('treats a top-level throw statement as impure', function () {
            assert.deepStrictEqual(classify('throw new Error("oops");'), [ { line: 1, kind: 'throw statement' } ]);
        });

        test('treats a labeled statement as impure', function () {
            assert.deepStrictEqual(classify('outer: { console.log(1); }'), [ { line: 1, kind: 'labeled statement' } ]);
        });

        test('treats a top-level block statement as impure', function () {
            assert.deepStrictEqual(classify('{ const x = 1; }'), [ { line: 1, kind: 'block statement' } ]);
        });
    });
});
