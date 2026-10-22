import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import { linkedBundle, analyzedBundleResource } from '../test-libraries/bundle-fixtures.ts';
import {
    createConfigurationWithoutRegistry,
    createPacktoryUnderTest,
    twoPackageEntries,
    type ResolveOptionsInput
} from '../test-libraries/package-orchestration-fixtures.ts';
import { getOkResult, getErrorResult } from '../test-libraries/result-helpers.ts';

suite('packtory package symbols', function () {
    test('rejects invalid configuration and unknown packages', async function () {
        const { packtory, resolveAndLink } = createPacktoryUnderTest();
        const invalid = await packtory.inspectPackageSymbols({ invalid: true }, 'package-a');
        assert.strictEqual(
            getErrorResult(
                invalid.result,
                'expected invalid configuration'
            )
                .type,
            'configuration'
        );
        assert.strictEqual(resolveAndLink.callCount, 0);
        const missing = await packtory.inspectPackageSymbols(createConfigurationWithoutRegistry(), 'missing');
        assert.deepStrictEqual(
            getErrorResult(
                missing.result,
                'expected unknown package'
            ),
            { type: 'package-not-found', packageName: 'missing' }
        );
    });

    test('inspects the selected package using its configured DCE setting', async function () {
        const { packtory } = createPacktoryUnderTest({
            resolveAndLink: fake(async function (options: ResolveOptionsInput) {
                const entry = analyzedBundleResource(`/${options.name}/index.js`, {
                    targetFilePath: 'index.js',
                    content: `const unused = 1;\nexport const ${options.name === 'package-a' ? 'first' : 'second'} = 2;`
                });
                return linkedBundle({
                    name: options.name,
                    contents: [ entry ],
                    roots: { main: { javaScript: entry.fileDescription } }
                });
            })
        });
        for (const enabled of [ true, false ]) {
            const config = createConfigurationWithoutRegistry({
                packages: twoPackageEntries.map(function (entry) {
                    return { ...entry, deadCodeElimination: { enabled } };
                })
            });
            const outcome = await packtory.inspectPackageSymbols(config, 'package-b');
            const inspection = getOkResult(
                outcome.result,
                'expected symbol inspection'
            );
            assert.strictEqual(inspection.packageName, 'package-b');
            assert.deepStrictEqual(
                inspection.symbols.map(function (symbol) {
                    return [ symbol.name, symbol.decision ];
                }),
                [ [ 'second', 'kept' ], [ 'unused', enabled ? 'removed' : 'kept' ] ]
            );
        }
    });

    test('propagates partial resolution failures', async function () {
        const error = new Error('missing resource');
        const { packtory } = createPacktoryUnderTest({
            async resolveStage() {
                return Result.err({ succeeded: [], failures: [ error ] });
            }
        });
        const outcome = await packtory.inspectPackageSymbols(createConfigurationWithoutRegistry(), 'package-a');
        const failure = getErrorResult(
            outcome.result,
            'expected resolution failure'
        );
        assert.deepStrictEqual(failure, { type: 'partial', error: { succeeded: [], failures: [ error ] } });
    });
});
