import assert from 'node:assert/strict';
import path from 'node:path';
import { RealFileSystemHost } from '@ts-morph/common';
import type { FileManager } from '../source/file-manager/file-manager.ts';
import {
    createVendorMaterializer,
    type VendorMaterializer
} from '../source/vendor-materializer/vendor-materializer.ts';
import { observeBenchmarkFiles } from './benchmark-file-observation.ts';
import { createVendoringWorkload, type VendoringCase, type VendoringWorkload } from './vendoring-workload.ts';
import { measurePreparedAsynchronousTask } from './tinybench-measurement.ts';
import type { PerformanceMeasurement, PerformanceWorkload, WorkMetrics } from './performance-benchmark-types.ts';

function verifyInventory(
    result: Awaited<ReturnType<VendorMaterializer['materializeExternals']>>,
    workload: VendoringWorkload
): void {
    assert.ok(result.isOk, `Vendoring failed: ${result.isErr ? JSON.stringify(result.error) : ''}`);
    assert.equal(result.value.entries.length, workload.files.size, 'Every dependency file must be retained');
    const manifests = new Set(
        result
            .value
            .entries
            .filter(function (entry) {
                return path.basename(entry.sourceAbsolutePath) === 'package.json';
            })
            .map(function (entry) {
                return entry.sourceAbsolutePath;
            })
    );
    assert.deepEqual(manifests, workload.manifestPaths, 'Distinct installed versions must remain distinct');
    const paths = new Set(result.value.entries.map(function (entry) {
        return entry.targetRelativePath;
    }));
    assert.equal(
        paths.size,
        result.value.entries.length,
        'Vendored paths must not collide'
    );
}

export async function runVendoringBenchmark(
    name: VendoringCase,
    rootDirectory: string,
    fileManager: FileManager,
    definition: PerformanceWorkload
): Promise<PerformanceMeasurement> {
    const samples: WorkMetrics[] = [];
    let iteration = 0;
    const measurement = await measurePreparedAsynchronousTask(`vendoring/${name}`, async function () {
        const projectFolder = path.join(rootDirectory, `vendor-${name}`, `sample-${iteration}`);
        iteration += 1;
        const workload = await createVendoringWorkload(fileManager, projectFolder, name, definition);
        const observation = observeBenchmarkFiles({
            fileManager,
            fileSystemHost: new RealFileSystemHost(),
            sourceFiles: new Map(),
            reachableFiles: new Set(),
            inventoryFiles: workload.files
        });
        const materializer = createVendorMaterializer({ fileManager: observation.fileManager }).createSession();
        return async function () {
            const outputCount = name === 'repeated-outputs' ? definition.entryPointCount : 1;
            for (let outputIndex = 0; outputIndex < outputCount; outputIndex += 1) {
                verifyInventory(
                    await materializer.materializeExternals({
                        dependencySources: [ {
                            projectFolder,
                            initialDependencyNames: workload.initialDependencyNames
                        } ]
                    }),
                    workload
                );
            }
            samples.push(observation.metrics());
        };
    });
    const metrics = samples.at(-1);
    assert.ok(metrics !== undefined);
    return { name: `vendoring/${name}`, kind: 'vendoring', ...measurement, metrics };
}
