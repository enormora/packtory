import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { PublishAllResult } from '../../packtory/packtory.ts';
import { getIssues, getResultType, getSucceededResults, isPreviewableResult } from './preview-result-inspectors.ts';

function okResult(value: PublishAllResult extends { value: infer T } ? T : never = [] as never): PublishAllResult {
    return { isOk: true, isErr: false, value } as unknown as PublishAllResult;
}

function errResult(error: PublishAllResult extends { error: infer T } ? T : never): PublishAllResult {
    return { isOk: false, isErr: true, error } as unknown as PublishAllResult;
}

suite('preview-result-inspectors', function () {
    test('isPreviewableResult returns true for an ok result', function () {
        assert.strictEqual(isPreviewableResult(okResult()), true);
    });

    test('isPreviewableResult returns true for a partial error with at least one succeeded entry', function () {
        assert.strictEqual(
            isPreviewableResult(
                errResult({
                    type: 'partial',
                    succeeded: [{ name: 'pkg-a' }],
                    failures: []
                } as never)
            ),
            true
        );
    });

    test('isPreviewableResult returns false for a non-partial error', function () {
        assert.strictEqual(isPreviewableResult(errResult({ type: 'config', issues: [] } as never)), false);
    });

    test('isPreviewableResult returns false for a partial error with no succeeded entries', function () {
        assert.strictEqual(
            isPreviewableResult(
                errResult({
                    type: 'partial',
                    succeeded: [],
                    failures: [{ message: 'boom' }]
                } as never)
            ),
            false
        );
    });

    test('getSucceededResults returns the value when the result is ok', function () {
        assert.deepStrictEqual(getSucceededResults(okResult([{ name: 'pkg-a' }] as never)), [{ name: 'pkg-a' }]);
    });

    test('getSucceededResults returns the succeeded list when the error is partial', function () {
        assert.deepStrictEqual(
            getSucceededResults(
                errResult({
                    type: 'partial',
                    succeeded: [{ name: 'pkg-a' }],
                    failures: []
                } as never)
            ),
            [{ name: 'pkg-a' }]
        );
    });

    test('getSucceededResults returns an empty array for non-partial errors', function () {
        assert.deepStrictEqual(getSucceededResults(errResult({ type: 'config', issues: [] } as never)), []);
    });

    test('getIssues returns an empty array for an ok result', function () {
        assert.deepStrictEqual(getIssues(okResult()), []);
    });

    test('getIssues maps partial failure messages onto the issues list', function () {
        assert.deepStrictEqual(
            getIssues(
                errResult({
                    type: 'partial',
                    succeeded: [],
                    failures: [{ message: 'boom' }, { message: 'bang' }]
                } as never)
            ),
            ['boom', 'bang']
        );
    });

    test('getIssues returns the config issues for a config error', function () {
        assert.deepStrictEqual(getIssues(errResult({ type: 'config', issues: ['missing'] } as never)), ['missing']);
    });

    test('getResultType returns "success" for an ok result', function () {
        assert.strictEqual(getResultType(okResult()), 'success');
    });

    test('getResultType returns the underlying error type for an err result', function () {
        assert.strictEqual(
            getResultType(errResult({ type: 'partial', succeeded: [], failures: [] } as never)),
            'partial'
        );
    });
});
