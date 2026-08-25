import assert from 'node:assert';
import { suite, test } from 'mocha';
import type {
    AnalyzedBundle,
    DeadCodeEliminator,
    EliminationInput
} from '../../dead-code-eliminator/analyzed-bundle.ts';
import type { ValidConfigWithoutRegistryResult } from '../../config/validation.ts';
import { packageConfigFixture, validConfigWithoutRegistryFixture } from '../../test-libraries/config-fixtures.ts';
import {
    createAnalyzedBundle,
    createLinkedBundle,
    createResolveOptions
} from '../../test-libraries/package-processor-test-support.ts';
import { analyzeResolvedPackages } from './package-analysis-stage.ts';
import type { LinkedPackage } from './package-resolution-stage.ts';

function configWithPackages(
    ...packages: readonly { readonly name: string; readonly enabled?: boolean; }[]
): ValidConfigWithoutRegistryResult {
    return validConfigWithoutRegistryFixture({
        packages: packages.map(function (packageEntry) {
            return packageConfigFixture({
                name: packageEntry.name,
                ...packageEntry.enabled === undefined ? {} : { deadCodeElimination: { enabled: packageEntry.enabled } }
            });
        })
    });
}

function linkedPackageNamed(name: string): LinkedPackage {
    return {
        name,
        linkedBundle: createLinkedBundle(name),
        resolveOptions: createResolveOptions()
    };
}

type EliminationBehavior = (inputs: readonly EliminationInput[]) => Promise<readonly AnalyzedBundle[]>;

function stubEliminator(behavior: EliminationBehavior): DeadCodeEliminator {
    return {
        eliminate: behavior
    };
}

type CapturedTransformationsEnabled = {
    readonly eliminator: DeadCodeEliminator;
    readonly getObserved: () => unknown;
};

function captureTransformationsEnabled(): CapturedTransformationsEnabled {
    let observed: unknown = null;
    const eliminator = stubEliminator(async function (inputs) {
        observed = inputs[0]?.transformationsEnabled;
        return [ createAnalyzedBundle(inputs[0]?.bundle.name) ];
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
                deadCodeEliminator: stubEliminator(async function () {
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
        const analyzed = [ createAnalyzedBundle('pkg-a') ];
        const eliminator = stubEliminator(async function (inputs) {
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

    test('analyzeResolvedPackages forwards substitution-public module paths to the matching package', async function () {
        const provider = linkedPackageNamed('pkg-a');
        const consumer = {
            ...linkedPackageNamed('consumer'),
            linkedBundle: {
                ...createLinkedBundle('consumer'),
                substitutedSourceFilePathsByPackageName: new Map([
                    [ 'pkg-a', new Set([ '/provider/feature.js', '/provider/feature.d.ts' ]) ]
                ])
            }
        };
        const eliminator = stubEliminator(async function (inputs) {
            assert.deepStrictEqual(
                inputs[0]?.substitutionPublicModuleSourceFilePaths,
                new Set([ '/provider/feature.js', '/provider/feature.d.ts' ])
            );
            assert.deepStrictEqual(inputs[1]?.substitutionPublicModuleSourceFilePaths, new Set<string>());
            return [ createAnalyzedBundle('pkg-a'), createAnalyzedBundle('consumer') ];
        });

        await analyzeResolvedPackages(
            { deadCodeEliminator: eliminator },
            configWithPackages({ name: 'pkg-a' }, { name: 'consumer' }),
            [ provider, consumer ]
        );
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
                    deadCodeEliminator: stubEliminator(async function () {
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
                    deadCodeEliminator: stubEliminator(async function () {
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
