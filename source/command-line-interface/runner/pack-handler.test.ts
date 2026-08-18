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

function packtoryStub(outcome: Readonly<PackOutcome>, spy: SinonSpy, flags: PackFlags): Packtory {
    return {
        async packPackage(...packageArguments: readonly unknown[]) {
            if (flags.all) {
                throw new Error('packPackage called for pack-all');
            }
            spy(...packageArguments);
            return outcome;
        },
        async packAllPackages(...packageArguments: readonly unknown[]) {
            if (!flags.all) {
                throw new Error('packAllPackages called for single-package pack');
            }
            spy(...packageArguments);
            return outcome;
        }
    } as unknown as Packtory;
}

function makeOutcome(result: Readonly<PackOutcome['result']>): PackOutcome {
    return { result };
}

function defaultFlags(overrides: Readonly<Partial<PackFlags>> = {}): PackFlags {
    return {
        all: false,
        packageName: 'pkg-a',
        format: 'zip',
        outputPath: '/out/pkg-a.zip',
        version: '0.0.0',
        vendorDependencies: false,
        trace: false,
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
            packtory: packtoryStub(outcome, packPackageSpy, flags),
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
        const packageArguments = packPackageSpy.firstCall.args as readonly unknown[];
        const options = packageArguments[1];
        assert.deepStrictEqual(options, {
            packageName: 'pkg-b',
            format: 'tar',
            outputPath: '/out/pkg-b.tgz',
            version: '1.2.3',
            vendorDependencies: false
        });
    });

    async function expectFailure(
        error: unknown,
        patterns: readonly RegExp[],
        overrides: Readonly<Partial<PackFlags>> = {}
    ): Promise<void> {
        const { dependencies, logSpy } = setup(
            makeOutcome({ isOk: false, isErr: true, error } as unknown as PackOutcome['result']),
            overrides
        );

        const code = await runPackHandler(dependencies);

        assert.strictEqual(code, 1);
        const message = logSpy.firstCall.args[0] as string;
        for (const pattern of patterns) {
            assert.match(message, pattern);
        }
    }

    suite('failures', function () {
        suite('issue failures', function () {
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

        suite('output path failures', function () {
            test('prints output folder collision failures', async function () {
                await expectFailure(
                    { type: 'output-folder-exists', packageName: 'pkg-a', outputPath: '/out/pkg-a' },
                    [ /Pack output folder "\/out\/pkg-a" for "pkg-a" already exists/u ]
                );
            });

            test('prints batch output root type failures', async function () {
                await expectFailure(
                    { type: 'output-root-not-directory', outputPath: '/out' },
                    [ /Pack output root "\/out" exists but is not a directory/u ],
                    { all: true, packageName: undefined, format: 'folder', outputPath: '/out' }
                );
            });

            test('prints unsafe output folder failures', async function () {
                await expectFailure(
                    { type: 'unsafe-output-folder', packageName: '../pkg-a', outputPath: '/pkg-a' },
                    [ /Package "\.\.\/pkg-a" cannot be packed safely to "\/pkg-a"/u ]
                );
            });
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

        test('summarises partial resolve failures with recursive cause messages', async function () {
            await expectFailure(
                {
                    type: 'partial',
                    error: {
                        succeeded: [],
                        failures: [
                            new Error('resolve A', { cause: new Error('read failed') }),
                            new Error('resolve B')
                        ]
                    }
                },
                [
                    /2 package\(s\) failed to resolve/u,
                    /- resolve A\n {2}Caused by: read failed\n- resolve B/u
                ]
            );
        });

        test('includes partial resolve failure stack traces when trace is enabled', async function () {
            const outcome = makeOutcome(
                {
                    isOk: false,
                    isErr: true,
                    error: {
                        type: 'partial',
                        error: {
                            succeeded: [],
                            failures: [ new Error('resolve A', { cause: new Error('read failed') }) ]
                        }
                    }
                } as unknown as PackOutcome['result']
            );
            const { dependencies, logSpy } = setup(outcome, { trace: true });

            const code = await runPackHandler(dependencies);

            assert.strictEqual(code, 1);
            const message = logSpy.firstCall.args[0] as string;
            assert.match(message, /Stack trace: Error: resolve A/u);
            assert.match(message, /Caused by stack trace: Error: read failed/u);
        });
    });

    test('stops spinners in the finally block', async function () {
        const { dependencies, stopAllSpy } = setup(
            makeOutcome({ isOk: true, isErr: false, value: undefined } as PackOutcome['result'])
        );

        await runPackHandler(dependencies);

        assert.strictEqual(stopAllSpy.callCount, 1);
    });
});
