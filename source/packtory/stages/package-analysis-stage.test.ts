/* eslint-disable @typescript-eslint/consistent-type-assertions -- test stubs cast partial mocks of complex orchestrator types */
import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { DeadCodeEliminator } from '../../dead-code-eliminator/analyzed-bundle.ts';
import type { ValidConfigWithoutRegistryResult } from '../../config/validation.ts';
import { analyzeResolvedPackages } from './package-analysis-stage.ts';
import type { LinkedPackage } from './package-resolution-stage.ts';

function configWithPackages(
    ...packages: readonly { readonly name: string; readonly enabled?: boolean; }[]
): ValidConfigWithoutRegistryResult {
    return {
        packtoryConfig: {
            packages: packages.map(function (pkg) {
                return {
                    name: pkg.name,
                    ...pkg.enabled === undefined ? {} : { deadCodeElimination: { enabled: pkg.enabled } }
                };
            })
        }
    } as unknown as ValidConfigWithoutRegistryResult;
}

function linkedPackageNamed(name: string): LinkedPackage {
    return {
        name,
        linkedBundle: { name } as never,
        resolveOptions: { name } as never
    };
}

function stubEliminator(
    behavior: (
        inputs: readonly { readonly bundle: unknown; readonly transformationsEnabled: boolean; }[]
    ) => readonly unknown[]
): DeadCodeEliminator {
    return {
        async eliminate(inputs) {
            return behavior(inputs) as never;
        }
    };
}

type CapturedTransformationsEnabled = {
    readonly eliminator: DeadCodeEliminator;
    readonly getObserved: () => unknown;
};

function captureTransformationsEnabled(): CapturedTransformationsEnabled {
    let observed: unknown = null;
    const eliminator = stubEliminator(function (inputs) {
        observed = inputs[0]?.transformationsEnabled;
        return [ { name: inputs[0]?.bundle as never } ];
    });
    return {
        eliminator,
        getObserved() {
            return observed;
        }
    };
}

suite('package-analysis-stage', function () {
    test('analyzeResolvedPackages returns an empty array when no linked packages are given', async function () {
        const result = await analyzeResolvedPackages(
            {
                deadCodeEliminator: stubEliminator(function () {
                    return [];
                })
            },
            configWithPackages(),
            []
        );

        assert.deepStrictEqual(result, []);
    });

    test('analyzeResolvedPackages passes each linked bundle into the dead-code eliminator', async function () {
        const linkedPackage = linkedPackageNamed('pkg-a');
        const analyzed = [ { name: 'pkg-a' } as never ];
        const eliminator = stubEliminator(function (inputs) {
            assert.strictEqual(inputs[0]?.bundle, linkedPackage.linkedBundle);
            return analyzed;
        });

        const result = await analyzeResolvedPackages(
            { deadCodeEliminator: eliminator },
            configWithPackages({ name: 'pkg-a' }),
            [ linkedPackage ]
        );

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0]?.analyzedBundle, analyzed[0]);
    });

    test('analyzeResolvedPackages forwards the configured enabled flag through transformationsEnabled', async function () {
        const { eliminator, getObserved } = captureTransformationsEnabled();

        await analyzeResolvedPackages(
            { deadCodeEliminator: eliminator },
            configWithPackages({ name: 'pkg-a', enabled: false }),
            [ linkedPackageNamed('pkg-a') ]
        );

        assert.strictEqual(getObserved(), false);
    });

    test('analyzeResolvedPackages defaults transformationsEnabled to true when no dead-code-elimination settings are configured', async function () {
        const { eliminator, getObserved } = captureTransformationsEnabled();

        await analyzeResolvedPackages({ deadCodeEliminator: eliminator }, configWithPackages({ name: 'pkg-a' }), [
            linkedPackageNamed('pkg-a')
        ]);

        assert.strictEqual(getObserved(), true);
    });

    test('analyzeResolvedPackages throws when the dead-code eliminator returns fewer bundles than packages', async function () {
        try {
            await analyzeResolvedPackages(
                {
                    deadCodeEliminator: stubEliminator(function () {
                        return [];
                    })
                },
                configWithPackages({ name: 'pkg-missing' }),
                [ linkedPackageNamed('pkg-missing') ]
            );
            assert.fail('expected analyzeResolvedPackages to throw');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'Analyzed bundle missing for package "pkg-missing"');
        }
    });

    test('analyzeResolvedPackages throws when the package has no dead-code-elimination entry in the resolution map', async function () {
        try {
            await analyzeResolvedPackages(
                {
                    deadCodeEliminator: stubEliminator(function () {
                        return [];
                    })
                },
                configWithPackages(),
                [
                    linkedPackageNamed('pkg-unmapped')
                ]
            );
            assert.fail('expected analyzeResolvedPackages to throw');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'Missing dead-code elimination settings for package "pkg-unmapped"');
        }
    });
});
