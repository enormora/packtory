import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type { Packtory } from '../../packtory/packtory.ts';
import { spinnerRendererStub } from '../../test-libraries/command-line-interface-handler-fixtures.ts';
import { runChangelogHandler, type ChangelogHandlerDependencies } from './changelog-handler.ts';

type TraceFixture = {
    readonly dependencies: ChangelogHandlerDependencies;
    readonly log: SinonSpy;
};

async function unusedPackageInformation(): Promise<never> {
    throw new Error('unused package info');
}

function unusedPullRequestLogEngine(): never {
    throw new Error('unused pr-log engine');
}

async function unusedPacktoryMethod(): Promise<never> {
    throw new Error('unused packtory method');
}

function createUnusedPacktory(): Packtory {
    return {
        analyzeReleaseAgainstLatestPublished: unusedPacktoryMethod,
        buildAndPublishAll: unusedPacktoryMethod,
        diffAgainstLatestPublished: unusedPacktoryMethod,
        inspectPackageDependencies: unusedPacktoryMethod,
        inspectPackageFiles: unusedPacktoryMethod,
        inspectPackageSideEffects: unusedPacktoryMethod,
        inspectPackageTree: unusedPacktoryMethod,
        packAllPackages: unusedPacktoryMethod,
        packPackage: unusedPacktoryMethod,
        planReleaseAgainstLatestPublished: unusedPacktoryMethod,
        resolveAndLinkAll: unusedPacktoryMethod
    };
}

function createTraceFixture(): TraceFixture {
    const log = fake();
    return {
        dependencies: {
            createPullRequestLogEngine: unusedPullRequestLogEngine,
            currentDate() {
                return new Date('2026-06-13T00:00:00.000Z');
            },
            fileManager: { readFile: fake.rejects(new Error('unused read')), writeFile: fake.resolves(undefined) },
            log(message) {
                log(message);
            },
            pageOutput: fake.resolves(undefined),
            packtory: createUnusedPacktory(),
            readEnvironmentVariable() {
                return undefined;
            },
            readPackageInformation: unusedPackageInformation,
            spinnerRenderer: spinnerRendererStub(),
            configurationLoader: { load: fake.rejects(new Error('config failed')) },
            trace: true,
            workingDirectory: '/repo'
        },
        log
    };
}

suite('changelog-handler trace', function () {
    test('prints a stack trace when a handler error is caught with trace enabled', async function () {
        const { dependencies, log } = createTraceFixture();

        const code = await runChangelogHandler(dependencies);

        assert.strictEqual(code, 1);
        assert.match(String(log.firstCall.args[0]), /Stack trace: Error: config failed/u);
    });
});
