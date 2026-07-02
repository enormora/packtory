import assert from 'node:assert';
import { suite, test } from 'mocha';
import { Result } from 'true-myth';
import {
    isSuccessOrPartialSuccess,
    mapResolvePartialFailure,
    partialFailureMessages,
    succeededResultsFrom
} from './partial-result.ts';

suite('partial-result', function () {
    test('succeededResultsFrom returns ok results unchanged', function () {
        const result = Result.ok<readonly string[], string>([ 'a', 'b' ]);

        assert.deepStrictEqual(succeededResultsFrom(result), [ 'a', 'b' ]);
    });

    test('succeededResultsFrom returns succeeded items from partial failures', function () {
        const result = Result.err<
            readonly string[],
            { readonly failures: readonly Error[]; readonly succeeded: readonly string[]; readonly type: 'partial'; }
        >({
            type: 'partial',
            succeeded: [ 'a' ],
            failures: []
        });

        assert.deepStrictEqual(succeededResultsFrom(result), [ 'a' ]);
    });

    test('succeededResultsFrom ignores non-object and null failures', function () {
        const stringFailure: Result<readonly string[], unknown> = Result.err('boom');
        const nullFailure: Result<readonly string[], unknown> = Result.err(null);
        const undefinedFailure: Result<readonly string[], unknown> = Result.err(undefined);

        assert.deepStrictEqual(succeededResultsFrom(stringFailure), []);
        assert.deepStrictEqual(succeededResultsFrom(nullFailure), []);
        assert.deepStrictEqual(succeededResultsFrom(undefinedFailure), []);
    });

    test('succeededResultsFrom ignores object failures without the partial discriminant', function () {
        const configFailure: Result<readonly string[], unknown> = Result.err({
            type: 'config',
            succeeded: [ 'wrong' ],
            issues: []
        });

        assert.deepStrictEqual(succeededResultsFrom(configFailure), []);
    });

    test('isSuccessOrPartialSuccess distinguishes full, partial, and failed results', function () {
        const okResult = Result.ok<readonly string[], string>([ 'a' ]);
        const partialResult = Result.err<
            readonly string[],
            { readonly failures: readonly Error[]; readonly succeeded: readonly string[]; readonly type: 'partial'; }
        >({
            type: 'partial',
            succeeded: [ 'a' ],
            failures: []
        });
        const failedResult = Result.err<readonly string[], string>('boom');

        assert.strictEqual(isSuccessOrPartialSuccess(okResult), true);
        assert.strictEqual(isSuccessOrPartialSuccess(partialResult), true);
        assert.strictEqual(isSuccessOrPartialSuccess(failedResult), false);
    });

    test('partialFailureMessages returns each failure message', function () {
        assert.deepStrictEqual(
            partialFailureMessages({
                succeeded: [ 'a' ],
                failures: [ new Error('first'), new Error('second') ]
            }),
            [ 'first', 'second' ]
        );
    });

    test('mapResolvePartialFailure keeps failures and resets succeeded items', function () {
        const failures = [ new Error('broken') ];

        assert.deepStrictEqual(
            mapResolvePartialFailure<string>({
                type: 'partial',
                error: {
                    succeeded: [],
                    failures
                }
            }),
            {
                type: 'partial',
                succeeded: [],
                failures
            }
        );
    });
});
