import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    renderMalformedSpecifierMessage,
    renderMutableSpecifierMessage,
    renderUnusedAllowListMessage
} from './specifier-errors.ts';

suite('specifier-errors', function () {
    test('renderMutableSpecifierMessage formats a multi-offender message exactly', function () {
        const message = renderMutableSpecifierMessage([
            { name: 'react', specifier: 'git+https://github.com/our-fork/react#v18.0.0', npaType: 'git' },
            { name: 'internal-tool', specifier: 'file:./vendor/internal-tool', npaType: 'file' }
        ]);

        assert.strictEqual(
            message,
            [
                "Refusing to publish: 2 dependencies use mutable specifiers, which bypass the npm registry's integrity guarantees:",
                '  - "react" → "git+https://github.com/our-fork/react#v18.0.0" (git)',
                '  - "internal-tool" → "file:./vendor/internal-tool" (file)',
                'Add the dep name to dependencyPolicy.allowMutableSpecifiers to allow this on purpose.'
            ]
                .join('\n')
        );
    });

    test('renderMutableSpecifierMessage uses the singular noun for a single offender', function () {
        const message = renderMutableSpecifierMessage([
            { name: 'react', specifier: 'git+https://github.com/foo/bar#v1', npaType: 'git' }
        ]);

        assert.strictEqual(
            message,
            [
                "Refusing to publish: 1 dependency uses a mutable specifier, which bypasses the npm registry's integrity guarantees:",
                '  - "react" → "git+https://github.com/foo/bar#v1" (git)',
                'Add the dep name to dependencyPolicy.allowMutableSpecifiers to allow this on purpose.'
            ]
                .join('\n')
        );
    });

    test('renderMalformedSpecifierMessage formats a single-offender message exactly', function () {
        const message = renderMalformedSpecifierMessage([
            {
                name: 'shared-utils',
                specifier: 'workspace:*',
                reason:
                    'workspace protocol is yarn/pnpm/bun-specific; resolved at install time by the workspace, not valid in a published manifest'
            }
        ]);

        assert.strictEqual(
            message,
            [
                'Refusing to publish: 1 dependency has a specifier that npm cannot publish:',
                '  - "shared-utils" → "workspace:*" (workspace protocol is yarn/pnpm/bun-specific; resolved at install time by the workspace, not valid in a published manifest)',
                'Replace with a registry version (e.g. "^1.2.3"). Mutable-specifier allow-listing does not apply here.'
            ]
                .join('\n')
        );
    });

    test('renderMalformedSpecifierMessage uses the plural verb for multiple offenders', function () {
        const message = renderMalformedSpecifierMessage([
            { name: 'a', specifier: 'workspace:*', reason: 'workspace reason' },
            { name: 'b', specifier: 'portal:./b', reason: 'portal reason' }
        ]);

        assert.strictEqual(
            message,
            [
                'Refusing to publish: 2 dependencies have a specifier that npm cannot publish:',
                '  - "a" → "workspace:*" (workspace reason)',
                '  - "b" → "portal:./b" (portal reason)',
                'Replace with a registry version (e.g. "^1.2.3"). Mutable-specifier allow-listing does not apply here.'
            ]
                .join('\n')
        );
    });

    test('renderUnusedAllowListMessage formats a single-entry message exactly', function () {
        const message = renderUnusedAllowListMessage([ 'old-vendored-pkg' ]);

        assert.strictEqual(
            message,
            [
                'Refusing to publish: 1 entry in dependencyPolicy.allowMutableSpecifiers is not in use:',
                '  - "old-vendored-pkg"',
                'Remove unused entries — they reflect stale exceptions to the integrity policy.'
            ]
                .join('\n')
        );
    });

    test('renderUnusedAllowListMessage uses the plural noun and verb for multiple entries', function () {
        const message = renderUnusedAllowListMessage([ 'old-vendored-pkg', 'still-clean-now' ]);

        assert.strictEqual(
            message,
            [
                'Refusing to publish: 2 entries in dependencyPolicy.allowMutableSpecifiers are not in use:',
                '  - "old-vendored-pkg"',
                '  - "still-clean-now"',
                'Remove unused entries — they reflect stale exceptions to the integrity policy.'
            ]
                .join('\n')
        );
    });
});
