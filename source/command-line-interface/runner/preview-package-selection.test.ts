import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import { packageConfigurationFixture, publicPublishSettings } from '../../test-libraries/configuration-fixtures.ts';
import {
    createBuildReportFixture,
    createPackageReportFixture,
    createArtifactEntryFixture
} from '../../test-libraries/preview-fixtures.ts';
import { createRunner } from '../../test-libraries/runner-test-support.ts';

const configuration = { packages: [ packageConfigurationFixture({ publishSettings: publicPublishSettings }) ] };
const report = createBuildReportFixture({
    packages: {
        'package-a': createPackageReportFixture({
            outputs: {
                tarball: {
                    entries: [ createArtifactEntryFixture({ path: 'retained.js', status: 'unchanged' }) ],
                    totalBytes: 20
                }
            }
        })
    }
});

suite('preview package selection', function () {
    test('rejects unknown packages before invoking the build', async function () {
        const buildAndPublishAll = fake();
        const log = fake();
        const runner = createRunner({ buildAndPublishAll, log, loadConfiguration: fake.resolves(configuration) });
        assert.strictEqual(await runner.run([ 'node', 'packtory', 'preview', '--package', 'unknown' ]), 1);
        assert.strictEqual(buildAndPublishAll.callCount, 0);
        assert.deepStrictEqual(log.firstCall.args, [ 'Package "unknown" is not configured' ]);
    });

    test('passes selection and all-files options while building the full workspace', async function () {
        const buildAndPublishAll = fake.resolves({
            result: Result.ok([]),
            getReport() {
                return report;
            }
        });
        const pageOutput = fake.resolves(undefined);
        const runner = createRunner({
            buildAndPublishAll,
            pageOutput,
            loadConfiguration: fake.resolves(configuration)
        });
        assert.strictEqual(
            await runner.run([ 'node', 'packtory', 'preview', '--package', 'package-a', '--all-files' ]),
            0
        );
        assert.deepStrictEqual(buildAndPublishAll.firstCall.args, [ configuration, {
            dryRun: true,
            stage: false,
            collectReport: true
        } ]);
        assert.ok(String(pageOutput.firstCall.args[0]).includes('retained.js'));
    });

    test('retains workspace failure status and diagnostics with a selected package', async function () {
        const buildAndPublishAll = fake.resolves({
            result: Result.err({ type: 'partial', succeeded: [], failures: [ new Error('sibling failed') ] }),
            getReport() {
                return report;
            }
        });
        const log = fake();
        const runner = createRunner({ buildAndPublishAll, log, loadConfiguration: fake.resolves(configuration) });
        assert.strictEqual(await runner.run([ 'node', 'packtory', 'preview', '--package', 'package-a' ]), 1);
        assert.ok(String(log.firstCall.args[0]).includes('sibling failed'));
    });
});
