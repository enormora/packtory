import assert from 'node:assert';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import type { ExternalDependencySource } from '../vendor-materializer/vendor-materializer.ts';
import {
    baseOptions,
    createDependencies,
    makeResolvedPackage,
    validatedConfig
} from '../test-libraries/packtory-pack-test-support.ts';
import type { ResolvedPackage } from './resolved-package.ts';
import { createRunPackValidated } from './packtory-pack.ts';

type VendorClosureScenario = {
    readonly description: string;
    readonly packages: readonly ResolvedPackage[];
    readonly dependencySources: readonly ExternalDependencySource[];
};

const scenarios: readonly VendorClosureScenario[] = [
    {
        description: 'vendors deduplicated externals from the complete bundled dependency tree',
        packages: [
            makeResolvedPackage({ bundleDependencyNames: [ 'pkg-b' ], externalDependencyNames: [ 'direct' ] }),
            makeResolvedPackage({
                name: 'pkg-b',
                bundleDependencyNames: [ 'pkg-d' ],
                externalDependencyNames: [ 'direct', 'middle' ]
            }),
            makeResolvedPackage({
                name: 'pkg-d',
                bundleDependencyNames: [ 'pkg-b' ],
                externalDependencyNames: [ 'leaf' ]
            }),
            makeResolvedPackage({ name: 'unbundled', externalDependencyNames: [ 'unused' ] })
        ],
        dependencySources: [ { initialDependencyNames: [ 'direct', 'middle', 'leaf' ], projectFolder: '/repo' } ]
    },
    {
        description: 'preserves each bundled package source folder for installed dependency resolution',
        packages: [
            makeResolvedPackage({
                bundleDependencyNames: [ 'pkg-b' ],
                externalDependencyNames: [ 'direct' ],
                sourcesFolder: '/repo/a'
            }),
            makeResolvedPackage({ name: 'pkg-b', externalDependencyNames: [ 'leaf' ], sourcesFolder: '/repo/b' })
        ],
        dependencySources: [
            { initialDependencyNames: [ 'direct' ], projectFolder: '/repo/a' },
            { initialDependencyNames: [ 'leaf' ], projectFolder: '/repo/b' }
        ]
    }
];

suite('packtory-pack bundled externals', function () {
    for (const scenario of scenarios) {
        test(scenario.description, async function () {
            const materializer = fake.resolves(
                Result.ok({ entries: [], packageNames: [], peerRequirements: new Map() })
            );
            const { dependencies, fakes } = createDependencies({
                materializerSpy: materializer,
                resolveResult: Result.ok(scenario.packages)
            });
            const result = await createRunPackValidated(dependencies)(
                validatedConfig,
                { ...baseOptions, vendorDependencies: true },
                fakes.resolveAndLinkAll
            );

            assert.deepStrictEqual(result.isOk ? result.value : result.error, undefined);
            assert.deepStrictEqual(materializer.args, [ [ { dependencySources: scenario.dependencySources } ] ]);
            assert.strictEqual(fakes.packEmitterPack.callCount, 1);
        });
    }
});
