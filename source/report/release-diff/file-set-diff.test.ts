import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { FileDescription } from '../../file-manager/file-description.ts';
import { buildFileSetDiff, type ModifiedFile } from './file-set-diff.ts';

function file(filePath: string, content: string, isExecutable = false): FileDescription {
    return { filePath, content, isExecutable };
}

function singleModifiedEntry(previous: readonly FileDescription[], current: readonly FileDescription[]): ModifiedFile {
    const diff = buildFileSetDiff(previous, current);
    assert.strictEqual(diff.modified.length, 1);
    const [ entry ] = diff.modified;
    if (entry === undefined) {
        assert.fail('expected modified entry');
    }
    return entry;
}

suite('file-set-diff', function () {
    test('classifies a file that only exists on the new side as added', function () {
        const diff = buildFileSetDiff([], [ file('lib/new.ts', 'export const x = 1;\n') ]);
        assert.strictEqual(diff.added.length, 1);
        assert.strictEqual(diff.removed.length, 0);
        assert.strictEqual(diff.modified.length, 0);
        assert.strictEqual(diff.unchanged.length, 0);
        assert.deepStrictEqual(diff.added[0], {
            path: 'lib/new.ts',
            sizeBytes: 'export const x = 1;\n'.length,
            isExecutable: false
        });
    });

    test('classifies a file that only exists on the previous side as removed', function () {
        const diff = buildFileSetDiff([ file('lib/legacy.ts', 'old\n') ], []);
        assert.strictEqual(diff.removed.length, 1);
        assert.deepStrictEqual(diff.removed[0], {
            path: 'lib/legacy.ts',
            sizeBytes: 'old\n'.length,
            isExecutable: false
        });
    });

    test('classifies identical files as unchanged', function () {
        const previous = [ file('package.json', '{"name":"p"}\n') ];
        const current = [ file('package.json', '{"name":"p"}\n') ];
        const diff = buildFileSetDiff(previous, current);
        assert.strictEqual(diff.unchanged.length, 1);
        assert.strictEqual(diff.modified.length, 0);
    });

    test('classifies same content with different exec bit as modified with mode-only change', function () {
        const entry = singleModifiedEntry(
            [ file('bin/cli.js', '#!/usr/bin/env node\n', false) ],
            [ file('bin/cli.js', '#!/usr/bin/env node\n', true) ]
        );
        assert.strictEqual(entry.contentChange.kind, 'mode-only');
        assert.strictEqual(entry.oldIsExecutable, false);
        assert.strictEqual(entry.newIsExecutable, true);
    });

    test('classifies different text content as modified with text hunks', function () {
        const entry = singleModifiedEntry(
            [ file('package.json', '{"name":"p","version":"1.0.0"}\n') ],
            [ file('package.json', '{"name":"p","version":"1.0.1"}\n') ]
        );
        if (entry.contentChange.kind !== 'text') {
            assert.fail(`expected text content change but got ${entry.contentChange.kind}`);
        }
        assert.ok(entry.contentChange.hunks.length > 0);
    });

    test('classifies different content with no text-diffable extension as binary modified', function () {
        const entry = singleModifiedEntry(
            [ file('assets/logo.png', 'previous-bytes') ],
            [ file('assets/logo.png', 'current-bytes') ]
        );
        assert.strictEqual(entry.contentChange.kind, 'binary');
    });

    test('classifies a mix of added, removed, modified and unchanged simultaneously', function () {
        const previous = [
            file('keep.ts', 'same\n'),
            file('gone.ts', 'will be removed\n'),
            file('change.ts', 'before\n')
        ];
        const current = [ file('keep.ts', 'same\n'), file('change.ts', 'after\n'), file('new.ts', 'new content\n') ];

        const diff = buildFileSetDiff(previous, current);

        assert.deepStrictEqual(
            diff.added.map(function (entry) {
                return entry.path;
            }),
            [ 'new.ts' ]
        );
        assert.deepStrictEqual(
            diff.removed.map(function (entry) {
                return entry.path;
            }),
            [ 'gone.ts' ]
        );
        assert.deepStrictEqual(
            diff.modified.map(function (entry) {
                return entry.path;
            }),
            [ 'change.ts' ]
        );
        assert.deepStrictEqual(
            diff.unchanged.map(function (entry) {
                return entry.path;
            }),
            [ 'keep.ts' ]
        );
    });

    test('sizes are computed in utf-8 bytes', function () {
        const previous = [ file('a.ts', 'á') ];
        const current = [ file('a.ts', 'á') ];
        const diff = buildFileSetDiff(previous, current);
        const [ unchanged ] = diff.unchanged;
        if (unchanged === undefined) {
            assert.fail('expected unchanged entry');
        }
        assert.strictEqual(unchanged.sizeBytes, Buffer.byteLength('á', 'utf8'));
    });
});
