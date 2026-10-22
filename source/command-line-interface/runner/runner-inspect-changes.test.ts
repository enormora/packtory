import assert from 'node:assert';
import { stripVTControlCharacters } from 'node:util';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import { createRunner, expectSubcommandHelp } from '../../test-libraries/runner-test-support.ts';
import {
    createConfigurationWithRegistry,
    twoPackageEntries
} from '../../test-libraries/package-orchestration-fixtures.ts';
import { createPackageReleaseDiff, textModifiedFileFactory } from '../../test-libraries/release-diff-fixtures.ts';
import { toReleaseDiffOutcome } from '../../test-libraries/result-helpers.ts';
import type { CommandLineInterfaceRunner } from './runner.ts';

type ChangesFixture = {
    readonly configuration: unknown;
    readonly diffAgainstLatestPublished: SinonSpy;
    readonly pageOutput: SinonSpy;
    readonly stopAll: SinonSpy;
    readonly runner: CommandLineInterfaceRunner;
};

function createChangesFixture(): ChangesFixture {
    const configuration = createConfigurationWithRegistry({ packages: twoPackageEntries });
    const outcome = toReleaseDiffOutcome(Result.ok([
        createPackageReleaseDiff({ name: 'package-a' }),
        createPackageReleaseDiff({
            name: 'package-b',
            files: {
                added: [],
                removed: [],
                unchanged: [],
                modified: [ textModifiedFileFactory.build({ path: 'index.js' }) ]
            }
        })
    ]));

    const diffAgainstLatestPublished = fake.resolves(outcome);
    const pageOutput = fake.resolves(undefined);
    const stopAll = fake();
    return {
        configuration,
        diffAgainstLatestPublished,
        pageOutput,
        stopAll,
        runner: createRunner({
            diffAgainstLatestPublished,
            loadConfiguration: fake.resolves(configuration),
            pageOutput,
            spinnerRenderer: { stopAll }
        })
    };
}

function assertSelectedOutput(output: string, filesOnly: boolean): void {
    assert.match(output, /package-b/u);
    assert.doesNotMatch(output, /package-a/u);
    assert.match(output, /index\.js/u);
    assert.strictEqual(output.includes('@@ -1,1 +1,1 @@'), !filesOnly);
}

suite('inspect changes command', function () {
    test('renders only the selected package using the registry diff pipeline and honors files-only', async function () {
        for (const filesOnly of [ false, true ]) {
            const { configuration, diffAgainstLatestPublished, pageOutput, stopAll, runner } = createChangesFixture();
            const args = [ 'node', 'packtory', 'inspect', 'changes', 'package-b' ];
            assert.strictEqual(await runner.run(filesOnly ? [ ...args, '--files-only' ] : args), 0);
            assert.deepStrictEqual(diffAgainstLatestPublished.firstCall.args, [ configuration ]);
            const output = stripVTControlCharacters(String(pageOutput.firstCall.args[0]));
            assertSelectedOutput(output, filesOnly);
            assert.ok(stopAll.called);
        }
    });

    test('preserves unscoped release-diff with valid configuration', async function () {
        const { runner, pageOutput } = createChangesFixture();
        assert.strictEqual(await runner.run([ 'node', 'packtory', 'release-diff' ]), 0);
        const output = stripVTControlCharacters(String(pageOutput.firstCall.args[0]));
        assert.match(output, /package-a/u);
        assert.match(output, /package-b/u);
    });

    test('rejects an unknown package before accessing the registry', async function () {
        const diffAgainstLatestPublished = fake();
        const log = fake();
        const runner = createRunner({
            diffAgainstLatestPublished,
            log,
            loadConfiguration: fake.resolves(createConfigurationWithRegistry())
        });
        assert.strictEqual(await runner.run([ 'node', 'packtory', 'inspect', 'changes', 'missing' ]), 1);
        assert.strictEqual(diffAgainstLatestPublished.callCount, 0);
        assert.strictEqual(log.firstCall.args[0], 'Package "missing" is not declared in the packtory configuration');
    });

    test('preserves validation and workspace failures', async function () {
        const diffAgainstLatestPublished = fake.resolves(
            toReleaseDiffOutcome(Result.err({ type: 'configuration', issues: [ 'bad registry' ] }))
        );
        const log = fake();
        const runner = createRunner({ diffAgainstLatestPublished, log, loadConfiguration: fake.resolves({}) });
        assert.strictEqual(await runner.run([ 'node', 'packtory', 'inspect', 'changes', 'package-a' ]), 1);
        assert.match(String(log.firstCall.args[0]), /bad registry/u);
    });

    test('shows workspace failures alongside the selected successful package', async function () {
        const pageOutput = fake.resolves(undefined);
        const diffAgainstLatestPublished = fake.resolves(toReleaseDiffOutcome(Result.err({
            type: 'partial',
            succeeded: [
                createPackageReleaseDiff({ name: 'package-a' }),
                createPackageReleaseDiff({ name: 'package-b' })
            ],
            failures: [ new Error('sibling failed') ]
        })));
        const runner = createRunner({
            diffAgainstLatestPublished,
            pageOutput,
            loadConfiguration: fake.resolves(createConfigurationWithRegistry({ packages: twoPackageEntries }))
        });
        assert.strictEqual(await runner.run([ 'node', 'packtory', 'inspect', 'changes', 'package-b' ]), 1);
        const output = stripVTControlCharacters(String(pageOutput.firstCall.args[0]));
        assert.match(output, /sibling failed/u);
        assert.match(output, /package-b/u);
        assert.doesNotMatch(output, /package-a/u);
    });

    test('prints help without loading config', async function () {
        const help = await expectSubcommandHelp('inspect', 'changes');
        assert.match(help, /packtory inspect changes/u);
        assert.match(help, /Compares one package with its latest published tarball\./u);
        assert.match(help, /--files-only/u);
        assert.match(help, /<package>/u);
    });
});
