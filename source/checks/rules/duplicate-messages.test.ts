import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { OwnerInformation } from './file-ownership.ts';
import { formatPathLevelMessage, formatSharedDeclarationsMessage } from './duplicate-messages.ts';

function owner(bundleName: string, survivingBindings: readonly string[] = []): OwnerInformation {
    return { bundleName, survivingBindings: new Set(survivingBindings) };
}

suite('duplicate-messages', function () {
    test('formatPathLevelMessage lists the owners alphabetically after the path', function () {
        assert.strictEqual(
            formatPathLevelMessage('/source/dup.ts', [ owner('package-c'), owner('package-a'), owner('package-b') ]),
            'File "/source/dup.ts" is included in multiple packages: package-a, package-b, package-c'
        );
    });

    test('formatSharedDeclarationsMessage sorts the shared declarations and owners alphabetically', function () {
        const message = formatSharedDeclarationsMessage('/source/dup.ts', new Set([ 'z', 'a' ]), [
            owner('package-b'),
            owner('package-a')
        ]);

        assert.strictEqual(
            message,
            [
                'File "/source/dup.ts" has shared declarations across multiple packages:',
                '  - "a" → package-a, package-b',
                '  - "z" → package-a, package-b'
            ]
                .join('\n')
        );
    });
});
