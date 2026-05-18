import assert from 'node:assert';
import { test } from 'mocha';
import type { OwnerInfo } from './file-ownership.ts';
import { formatPathLevelMessage, formatSharedDeclarationsMessage } from './duplicate-messages.ts';

function owner(bundleName: string, survivingBindings: readonly string[] = []): OwnerInfo {
    return { bundleName, survivingBindings: new Set(survivingBindings) };
}

test('formatPathLevelMessage lists the owners alphabetically after the path', () => {
    assert.strictEqual(
        formatPathLevelMessage('/src/dup.ts', [owner('pkg-c'), owner('pkg-a'), owner('pkg-b')]),
        'File "/src/dup.ts" is included in multiple packages: pkg-a, pkg-b, pkg-c'
    );
});

test('formatSharedDeclarationsMessage sorts the shared declarations and owners alphabetically', () => {
    const message = formatSharedDeclarationsMessage('/src/dup.ts', new Set(['z', 'a']), [
        owner('pkg-b'),
        owner('pkg-a')
    ]);

    assert.strictEqual(
        message,
        [
            'File "/src/dup.ts" has shared declarations across multiple packages:',
            '  - "a" → pkg-a, pkg-b',
            '  - "z" → pkg-a, pkg-b'
        ].join('\n')
    );
});
