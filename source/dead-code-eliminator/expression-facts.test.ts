import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    expressionFactIsPure,
    pureValueFact,
    unknownFact
} from './expression-facts.ts';

suite('expression facts', function () {
    test('exported value facts keep their discriminants', function () {
        assert.deepStrictEqual(pureValueFact, { origin: undefined, type: 'pure-value' });
        assert.strictEqual(expressionFactIsPure(pureValueFact), true);
    });

    test('exported unknown facts keep their discriminants', function () {
        assert.deepStrictEqual(unknownFact, { origin: undefined, type: 'unknown' });
        assert.strictEqual(expressionFactIsPure(unknownFact), false);
    });
});
