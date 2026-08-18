import assert from 'node:assert';
import { stripVTControlCharacters } from 'node:util';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import { Result } from 'true-myth';
import type { Packtory } from '../../packtory/packtory.ts';
import { createConfigLoaderStub } from '../../test-libraries/handler-stub-fixtures.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { runPackageTreeHandler, type PackageTreeHandlerDependencies } from './package-tree-handler.ts';

type PackageTreeOutcome = Awaited<ReturnType<Packtory['inspectPackageTree']>>;
type PackageTreeHandlerFixture = {
    readonly dependencies: PackageTreeHandlerDependencies;
    readonly inspectPackageTree: SinonSpy;
    readonly log: SinonSpy;
    readonly stopAll: SinonSpy;
};

function spinnerRendererCapturing(stopAll: SinonSpy): TerminalSpinnerRenderer {
    return { stopAll } as unknown as TerminalSpinnerRenderer;
}

function packtoryStub(outcome: PackageTreeOutcome, inspectPackageTree: SinonSpy): Packtory {
    return {
        async inspectPackageTree(...commandArguments: readonly unknown[]) {
            inspectPackageTree(...commandArguments);
            return outcome;
        }
    } as unknown as Packtory;
}

function setup(outcome: PackageTreeOutcome, trace = false): PackageTreeHandlerFixture {
    const inspectPackageTree = fake();
    const log = fake();
    const stopAll = fake();
    return {
        dependencies: {
            log(message) {
                log(stripVTControlCharacters(message));
            },
            packtory: packtoryStub(outcome, inspectPackageTree),
            spinnerRenderer: spinnerRendererCapturing(stopAll),
            configLoader: createConfigLoaderStub(),
            flags: { packageName: 'pkg-a', trace }
        },
        inspectPackageTree,
        log,
        stopAll
    };
}

suite('package-tree-handler', function () {
    test('prints the rendered package tree on success', async function () {
        const { dependencies, inspectPackageTree, log } = setup({
            result: Result.ok({
                packageName: 'pkg-a',
                entries: [
                    { path: 'package.json', sizeBytes: 2, kind: 'manifest', status: 'generated', badges: [] }
                ]
            })
        });

        const code = await runPackageTreeHandler(dependencies);

        assert.strictEqual(code, 0);
        assert.deepStrictEqual(inspectPackageTree.firstCall.args, [ {}, 'pkg-a' ]);
        assert.strictEqual(log.firstCall.args[0], 'pkg-a\n  • package.json (manifest, 2 B) [generated]');
    });

    test('prints config issues and exits 1', async function () {
        const { dependencies, log } = setup({
            result: Result.err({ type: 'config', issues: [ 'bad config' ] })
        });

        const code = await runPackageTreeHandler(dependencies);

        assert.strictEqual(code, 1);
        assert.strictEqual(log.firstCall.args[0], 'Packtory tree [Dry run]\nConfiguration issues\n- bad config');
    });

    test('prints check issues and exits 1', async function () {
        const { dependencies, log } = setup({
            result: Result.err({ type: 'checks', issues: [ 'bad check' ] })
        });

        const code = await runPackageTreeHandler(dependencies);

        assert.strictEqual(code, 1);
        assert.strictEqual(log.firstCall.args[0], 'Packtory tree [Dry run]\nCheck failures\n- bad check');
    });

    test('prints package-not-found failures and exits 1', async function () {
        const { dependencies, log } = setup({
            result: Result.err({ type: 'package-not-found', packageName: 'missing' })
        });

        const code = await runPackageTreeHandler(dependencies);

        assert.strictEqual(code, 1);
        assert.strictEqual(log.firstCall.args[0], 'Package "missing" is not declared in the packtory configuration');
    });

    test('prints a fallback for non-selection package failures', async function () {
        const { dependencies, log } = setup({
            result: Result.err({
                type: 'peer-dependencies-unsatisfied',
                packageName: 'pkg-a',
                items: [ { packageName: 'dep', peer: 'react' } ]
            })
        });

        const code = await runPackageTreeHandler(dependencies);

        assert.strictEqual(code, 1);
        assert.strictEqual(log.firstCall.args[0], 'Package "pkg-a" could not be inspected');
    });

    test('prints a generic fallback for package failures without a package name', async function () {
        const { dependencies, log } = setup({
            result: Result.err({ type: 'output-root-not-directory', outputPath: '/out' })
        });

        const code = await runPackageTreeHandler(dependencies);

        assert.strictEqual(code, 1);
        assert.strictEqual(log.firstCall.args[0], 'Package could not be inspected');
    });

    test('prints partial failure stack traces when trace is enabled', async function () {
        const { dependencies, log } = setup({
            result: Result.err({
                type: 'partial',
                error: {
                    succeeded: [],
                    failures: [ new Error('resolve failed') ]
                }
            })
        }, true);

        const code = await runPackageTreeHandler(dependencies);

        assert.strictEqual(code, 1);
        assert.match(String(log.firstCall.args[0]), /^Packtory tree \[Dry run\]/u);
        assert.match(
            String(log.firstCall.args[0]),
            /Package failures\n- resolve failed\n {2}Stack trace: Error: resolve failed/u
        );
    });

    test('stops spinners both after the call and in the finally block', async function () {
        const { dependencies, stopAll } = setup({
            result: Result.ok({ packageName: 'pkg-a', entries: [] })
        });

        await runPackageTreeHandler(dependencies);

        assert.strictEqual(stopAll.callCount, 2);
    });
});
