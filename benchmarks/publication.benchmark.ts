import assert from 'node:assert/strict';
import path from 'node:path';
import {
    bundle,
    createContext,
    resource,
    sourceTreeResources,
    verify,
    withPackageManifest
} from '../source/test-libraries/published-artifact-smoke-gate-fixtures.ts';
import { measurePreparedAsynchronousTask } from './tinybench-measurement.ts';

const maximumMilliseconds = 250;
const dependencySourceFileCount = 64;
const maximumDependencyReadabilityChecks = 2;

export async function runPublishedDependencyBenchmark(
    thresholdMultiplier: number,
    writeLine: (message: string) => void
): Promise<void> {
    const name = 'published-dependencies/repository-lookup';
    const measurement = await measurePreparedAsynchronousTask(name, async function () {
        const target = withPackageManifest(
            bundle({ contents: [ resource('index.js'), ...sourceTreeResources(dependencySourceFileCount) ] }),
            {
                dependencies: { external: '^1.0.0' }
            }
        );
        const context = createContext({});
        return async function () {
            await verify(context.gate, target);
            assert.strictEqual(
                context.checkReadability.callCount,
                maximumDependencyReadabilityChecks,
                'Source files must not multiply dependency lookups'
            );
            assert.deepStrictEqual(context.linkDirectory.firstCall.args, [
                path.join('/repo', 'node_modules', 'external'),
                path.join('/repo', 'target/packtory-smoke/node_modules/external'),
                'dir'
            ]);
        };
    });
    writeLine(
        `- ${name}: median ${
            measurement
                .medianMilliseconds
                .toFixed(1)
        }ms, readability checks 2, samples ${measurement.sampleCount}`
    );
    assert.ok(
        measurement.medianMilliseconds <= maximumMilliseconds * thresholdMultiplier,
        `${name} exceeded ${maximumMilliseconds}ms`
    );
}
