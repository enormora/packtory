import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import {
    createConfigurationWithoutRegistry,
    twoPackageEntries,
    type ResolveOptionsInput,
    createPacktoryUnderTest
} from '../test-libraries/package-orchestration-fixtures.ts';
import { analyzedBundleResource, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { getOkResult, getErrorResult } from '../test-libraries/result-helpers.ts';

suite('packtory package files', function () {
    test('validates configuration before inspecting files', async function () {
        const { packtory, resolveAndLink } = createPacktoryUnderTest();
        const outcome = await packtory.inspectPackageFiles({ invalid: true }, 'package-a');
        assert.strictEqual(getErrorResult(outcome.result, 'expected configuration failure').type, 'configuration');
        assert.strictEqual(resolveAndLink.callCount, 0);
    });

    test('reports unknown packages and resolution failures', async function () {
        const { packtory } = createPacktoryUnderTest();
        const missing = await packtory.inspectPackageFiles(createConfigurationWithoutRegistry(), 'missing');
        assert.deepStrictEqual(getErrorResult(missing.result, 'expected unknown package'), {
            type: 'package-not-found',
            packageName: 'missing'
        });
        const failing = createPacktoryUnderTest({
            async resolveStage() {
                return Result.err({ succeeded: [], failures: [ new Error('cannot resolve') ] });
            }
        });
        const failure = await failing.packtory.inspectPackageFiles(createConfigurationWithoutRegistry(), 'package-a');
        assert.strictEqual(getErrorResult(failure.result, 'expected resolution failure').type, 'partial');
    });

    test('combines retained output with discovery metadata from before elimination', async function () {
        const entry = analyzedBundleResource('/repo/index.js', {
            targetFilePath: 'index.js',
            directDependencies: new Set([ 'middle.js' ])
        });
        const middle = analyzedBundleResource('/repo/middle.js', {
            targetFilePath: 'middle.js',
            directDependencies: new Set([ 'leaf.js' ])
        });
        const leaf = analyzedBundleResource('/repo/leaf.js', { targetFilePath: 'leaf.js' });
        const bundle = linkedBundle({
            contents: [ entry, middle, leaf ],
            roots: { main: { javaScript: entry.fileDescription } }
        });
        const { packtory } = createPacktoryUnderTest({
            resolveAndLink: fake.resolves(bundle),
            deadCodeEliminator: {
                async eliminate() {
                    return [ { ...bundle, contents: [ leaf ], sideEffectsField: false } ];
                }
            }
        });
        const outcome = await packtory.inspectPackageFiles(createConfigurationWithoutRegistry(), 'package-a');
        assert.deepStrictEqual(getOkResult(outcome.result, 'expected file inspection'), {
            packageName: 'package-a',
            files: [ {
                packagePath: './leaf.js',
                sourcePath: 'repo/leaf.js',
                kind: 'file',
                discovery: {
                    type: 'discovered',
                    chain: [
                        { packagePath: './index.js', sourcePath: 'repo/index.js', via: 'root' },
                        { packagePath: './middle.js', sourcePath: 'repo/middle.js', via: 'import' },
                        { packagePath: './leaf.js', sourcePath: 'repo/leaf.js', via: 'import' }
                    ]
                }
            } ]
        });
    });

    test('uses the selected package discovery graph when several packages share output paths', async function () {
        const { packtory } = createPacktoryUnderTest({
            resolveAndLink: fake(async function (options: ResolveOptionsInput) {
                const entry = analyzedBundleResource(`/repo/${options.name}/entry.js`, {
                    targetFilePath: 'entry.js',
                    directDependencies: new Set([ `${options.name}.js` ])
                });
                const leaf = analyzedBundleResource(`/repo/${options.name}/leaf.js`, {
                    targetFilePath: `${options.name}.js`
                });
                return linkedBundle({
                    name: options.name,
                    contents: [ entry, leaf ],
                    roots: { main: { javaScript: entry.fileDescription } }
                });
            })
        });
        const outcome = await packtory.inspectPackageFiles(
            createConfigurationWithoutRegistry({
                packages: twoPackageEntries.map(function (entry) {
                    return { ...entry, deadCodeElimination: { enabled: false } };
                })
            }),
            'package-b'
        );
        const inspection = getOkResult(outcome.result, 'expected selected package files');
        assert.strictEqual(inspection.packageName, 'package-b');
        assert.deepStrictEqual(
            inspection.files.map(function (file) {
                return file.sourcePath;
            }),
            [
                'repo/package-b/entry.js',
                'repo/package-b/leaf.js'
            ]
        );
        assert.deepStrictEqual(inspection.files[1]?.discovery, {
            type: 'discovered',
            chain: [
                { packagePath: './entry.js', sourcePath: 'repo/package-b/entry.js', via: 'root' },
                { packagePath: './package-b.js', sourcePath: 'repo/package-b/leaf.js', via: 'import' }
            ]
        });
    });
});
