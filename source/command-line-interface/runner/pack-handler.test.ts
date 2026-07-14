import assert from 'node:assert';
import { stripVTControlCharacters } from 'node:util';
import { suite, test } from 'mocha';
import { fake, type SinonSpy } from 'sinon';
import type { Packtory } from '../../packtory/packtory.ts';
import { createConfigLoaderStub } from '../../test-libraries/handler-stub-fixtures.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { runPackHandler, type PackHandlerDependencies } from './pack-handler.ts';

type PackFlags = PackHandlerDependencies['flags'];

type PackOutcome = Awaited<ReturnType<Packtory['packPackage']>>;
type PackHandlerFixture = {
    readonly dependencies: PackHandlerDependencies;
    readonly logSpy: SinonSpy;
    readonly stopAllSpy: SinonSpy;
    readonly packPackageSpy: SinonSpy;
};

function spinnerRendererCapturing(stopAll: SinonSpy): TerminalSpinnerRenderer {
    return { stopAll } as unknown as TerminalSpinnerRenderer;
}

function packtoryStub(outcome: Readonly<PackOutcome>, spy: SinonSpy): Packtory {
    return {
        async packPackage(...args: readonly unknown[]) {
            spy(...args);
            return outcome;
        }
    } as unknown as Packtory;
}

function makeOutcome(result: Readonly<PackOutcome['result']>): PackOutcome {
    return { result };
}

function defaultFlags(overrides: Readonly<Partial<PackFlags>> = {}): PackFlags {
    return {
        packageName: 'pkg-a',
        format: 'zip',
        outputPath: '/out/pkg-a.zip',
        version: '0.0.0',
        vendorDependencies: false,
        ...overrides
    };
}

function setup(
    outcome: PackOutcome,
    overrides: Readonly<Partial<PackFlags>> = {}
): PackHandlerFixture {
    const logSpy = fake();
    const stopAllSpy = fake();
    const packPackageSpy = fake();
    const flags = defaultFlags(overrides);
    return {
        dependencies: {
            log(message) {
                logSpy(stripVTControlCharacters(message));
            },
            packtory: packtoryStub(outcome, packPackageSpy),
            spinnerRenderer: spinnerRendererCapturing(stopAllSpy),
            configLoader: createConfigLoaderStub(),
            flags
        },
        logSpy,
        stopAllSpy,
        packPackageSpy
    };
}

suite('pack-handler', function () {
    test('returns 0 and logs a success line when the pack outcome is Ok', async function () {
        const { dependencies, logSpy } = setup(
            makeOutcome({ isOk: true, isErr: false, value: undefined } as PackOutcome['result'])
        );

        const code = await runPackHandler(dependencies);

        assert.strictEqual(code, 0);
        assert.strictEqual(logSpy.callCount, 1);
        assert.match(logSpy.firstCall.args[0] as string, /Packed "pkg-a" as zip to \/out\/pkg-a\.zip/u);
    });

    test('forwards the flag values into packtory.packPackage', async function () {
        const { dependencies, packPackageSpy } = setup(
            makeOutcome({ isOk: true, isErr: false, value: undefined } as PackOutcome['result']),
            { packageName: 'pkg-b', format: 'tar', outputPath: '/out/pkg-b.tgz', version: '1.2.3' }
        );

        await runPackHandler(dependencies);

        assert.strictEqual(packPackageSpy.callCount, 1);
        const args = packPackageSpy.firstCall.args as readonly unknown[];
        const options = args[1];
        assert.deepStrictEqual(options, {
            packageName: 'pkg-b',
            format: 'tar',
            outputPath: '/out/pkg-b.tgz',
            version: '1.2.3',
            vendorDependencies: false
        });
    });

    async function expectFailure(error: unknown, patterns: readonly RegExp[]): Promise<void> {
        const { dependencies, logSpy } = setup(
            makeOutcome({ isOk: false, isErr: true, error } as unknown as PackOutcome['result'])
        );

        const code = await runPackHandler(dependencies);

        assert.strictEqual(code, 1);
        const message = logSpy.firstCall.args[0] as string;
        for (const pattern of patterns) {
            assert.match(message, pattern);
        }
    }

    suite('failures', function () {
        test('prints the config issues separated by newlines with the total issue count', async function () {
            await expectFailure({ type: 'config', issues: [ 'bad-one', 'bad-two' ] }, [
                /config is invalid/u,
                /2 issue\(s\)/u,
                /- bad-one\n- bad-two/u
            ]);
        });

        test('prints the check issues separated by newlines with the total issue count', async function () {
            await expectFailure({ type: 'checks', issues: [ 'rule-a', 'rule-b' ] }, [
                /Checks failed/u,
                /2 issue\(s\)/u,
                /- rule-a\n- rule-b/u
            ]);
        });

        test('prints a package-not-found message when packPackage returns that failure', async function () {
            await expectFailure({ type: 'package-not-found', packageName: 'missing-pkg' }, [
                /Package "missing-pkg" is not declared/u
            ]);
        });

        test('explains the missing vendor flag when bundle-dependencies-unsupported is reported', async function () {
            await expectFailure({ type: 'bundle-dependencies-unsupported', packageName: 'pkg-a' }, [
                /bundleDependencies which pack does not yet support/u
            ]);
        });

        test('lists each unsatisfied peer dependency on its own line when the closure is incomplete', async function () {
            await expectFailure(
                {
                    type: 'peer-dependencies-unsatisfied',
                    packageName: 'pkg-a',
                    items: [
                        { packageName: 'react-dom', peer: 'react' },
                        { packageName: 'styled-components', peer: 'react' }
                    ]
                },
                [
                    /Pack of "pkg-a" is missing 2 peer dependency\(ies\)/u,
                    /- "react-dom" needs peer "react"\n- "styled-components" needs peer "react"/u
                ]
            );
        });

        test('surfaces the vendored package, escaped entry path, and resolved target when a vendor symlink leaves its package directory', async function () {
            await expectFailure(
                {
                    type: 'vendor-symlink-target-outside-package',
                    packageName: 'pkg-a',
                    vendoredPackageName: 'evil-helper',
                    entryRelativePath: 'config/defaults.json',
                    resolvedTargetPath: '/Users/victim/.npmrc'
                },
                [
                    /escapes its package directory\n- "evil-helper" contains "config\/defaults\.json" which resolves to "\/Users\/victim\/\.npmrc"/u
                ]
            );
        });

        test('identifies the source manifest and offending key when a vendored package.json carries an invalid dependency name', async function () {
            await expectFailure(
                {
                    type: 'vendor-invalid-dependency-name',
                    packageName: 'pkg-a',
                    sourcePackageName: 'legit-utils',
                    invalidDependencyName: '../../legit-utils'
                },
                [
                    /invalid dependency name\n- "legit-utils" declares dependency "\.\.\/\.\.\/legit-utils" which is not a valid npm package name/u
                ]
            );
        });

        test('labels the source as the configured external set when an invalid dependency name is supplied directly to the materializer', async function () {
            await expectFailure(
                {
                    type: 'vendor-invalid-dependency-name',
                    packageName: 'pkg-a',
                    sourcePackageName: undefined,
                    invalidDependencyName: '../escape'
                },
                [ /invalid dependency name\n- the configured external set declares dependency "\.\.\/escape"/u ]
            );
        });

        test('summarises partial resolve failures with one line per failure', async function () {
            await expectFailure(
                {
                    type: 'partial',
                    error: { succeeded: [], failures: [ new Error('resolve A'), new Error('resolve B') ] }
                },
                [ /2 package\(s\) failed to resolve/u, /- resolve A\n- resolve B/u ]
            );
        });
    });

    test('stops spinners both immediately after the call and again in the finally block', async function () {
        const { dependencies, stopAllSpy } = setup(
            makeOutcome({ isOk: true, isErr: false, value: undefined } as PackOutcome['result'])
        );

        await runPackHandler(dependencies);

        assert.strictEqual(stopAllSpy.callCount, 2);
    });
});
