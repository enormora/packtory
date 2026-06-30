import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import {
    createConfigWithoutRegistry,
    createLinkedBundle,
    createPacktoryUnderTest,
    twoPackageEntries,
    type PacktoryUnderTest,
    type ResolveOptionsInput
} from '../test-libraries/packtory-test-support.ts';
import { getErrResult, getOkResult } from '../test-libraries/result-helpers.ts';

suite('packtory resolve', function () {
    test('resolveAndLinkAll() returns config issues when the config without registry is invalid', async function () {
        const { packtory } = createPacktoryUnderTest();

        const { result } = await packtory.resolveAndLinkAll({ invalid: true });

        const error = getErrResult(result, 'Expected resolveAndLinkAll() should fail but it did not');
        assert.strictEqual(error.type, 'config');
    });

    function createPacktoryThatSharesSourceFile(): PacktoryUnderTest {
        return createPacktoryUnderTest({
            resolveAndLink: fake(async function (options: ResolveOptionsInput) {
                return createLinkedBundle(options.name, '/shared.js');
            })
        });
    }

    test('resolveAndLinkAll() returns check failures after the linked bundles were built', async function () {
        const { packtory } = createPacktoryThatSharesSourceFile();

        const { result } = await packtory.resolveAndLinkAll(
            createConfigWithoutRegistry({
                checks: { noDuplicatedFiles: { enabled: true } },
                packages: twoPackageEntries
            })
        );

        assert.deepStrictEqual(
            result,
            Result.err({
                type: 'checks',
                issues: [ 'File "/shared.js" is included in multiple packages: package-a, package-b' ]
            })
        );
    });

    test('resolveAndLinkAll() returns all resolved packages on success', async function () {
        const { packtory, resolveAndLink, scheduler } = createPacktoryUnderTest();

        const { result } = await packtory.resolveAndLinkAll(
            createConfigWithoutRegistry({
                packages: [
                    { name: 'dependency', roots: { main: { js: 'dependency/index.js' } } },
                    {
                        name: 'package-a',
                        roots: { main: { js: 'package-a/index.js' } },
                        bundleDependencies: [ 'dependency' ]
                    }
                ]
            })
        );

        const resolvedPackages = getOkResult(result, 'Expected resolveAndLinkAll() should succeed');
        assert.strictEqual(resolveAndLink.callCount, 2);
        assert.strictEqual(scheduler.runForEachScheduledPackage.callCount, 1);
        assert.deepStrictEqual(
            resolvedPackages.map(function (entry) {
                return entry.name;
            }),
            [ 'dependency', 'package-a' ]
        );
    });
});
