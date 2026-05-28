import assert from 'node:assert';
import { suite, test } from 'mocha';
import { noPublication, publishedToRegistry, stagedForApproval } from './publication-outcome.ts';

suite('publication-outcome', function () {
    test('exposes the none outcome constant', function () {
        assert.deepStrictEqual(noPublication, { type: 'none' });
    });

    test('exposes the published outcome constant', function () {
        assert.deepStrictEqual(publishedToRegistry, { type: 'published' });
    });

    test('creates staged outcomes with the stage id', function () {
        assert.deepStrictEqual(stagedForApproval('stage-123'), {
            type: 'staged',
            stageId: 'stage-123'
        });
    });
});
