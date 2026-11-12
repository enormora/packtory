import assert from 'node:assert/strict';
import path from 'node:path';
import { inspect } from 'node:util';
import { match } from 'ts-pattern';
import type { FileManager } from '../source/file-manager/file-manager.ts';
import type { PackFormat } from '../source/pack-emitter/pack-emitter.ts';
import type { BenchmarkPipeline } from './benchmark-pipeline.ts';
import type { PipelineCase, PipelineWorkload } from './pipeline-workload.ts';
import { verifyPipelineArtifact, type PipelineArtifact } from './pipeline-artifact-verification.ts';
import type { WorkMetrics } from './performance-benchmark-types.ts';

export type PipelineExecution = {
    readonly pipeline: BenchmarkPipeline;
    readonly workload: PipelineWorkload;
    readonly scenario: PipelineCase;
    readonly projectFolder: string;
    readonly outputPath: string;
};

async function publishDryRun(execution: PipelineExecution): Promise<void> {
    const { result } = await execution.pipeline.packtory.buildAndPublishAll(execution.workload.configuration, {
        dryRun: true,
        stage: false
    });
    assert.ok(result.isOk, `Publish dry run failed: ${result.isErr ? inspect(result.error, { depth: null }) : ''}`);
    assert.equal(result.value.length, execution.workload.configuration.packages.length);
    assert.ok(
        result.value.every(function (publication) {
            return publication.publication.type === 'none';
        }),
        'Dry runs must never publish'
    );
}

async function packBatch(execution: PipelineExecution): Promise<void> {
    const { result } = await execution.pipeline.packtory.packAllPackages(execution.workload.configuration, {
        outputPath: execution.outputPath,
        version: '1.0.0',
        vendorDependencies: true
    });
    assert.ok(result.isOk, `Batch pack failed: ${result.isErr ? JSON.stringify(result.error) : ''}`);
    assert.equal(result.value.packageNames.length, execution.workload.configuration.packages.length);
}

async function packSingle(execution: PipelineExecution, format: PackFormat): Promise<void> {
    const { result } = await execution.pipeline.packtory.packPackage(execution.workload.configuration, {
        packageName: 'performance-package-0',
        format,
        outputPath: execution.outputPath,
        version: '1.0.0',
        vendorDependencies: true
    });
    assert.ok(result.isOk, `Pack failed: ${result.isErr ? JSON.stringify(result.error) : ''}`);
}

async function analyze(execution: PipelineExecution): Promise<void> {
    const { result } = await execution.pipeline.packtory.resolveAndLinkAll(execution.workload.configuration);
    assert.ok(result.isOk, `Analysis failed: ${result.isErr ? JSON.stringify(result.error) : ''}`);
    assert.equal(result.value.length, execution.workload.configuration.packages.length);
    if (execution.scenario.deadExports) {
        const contents = result
            .value
            .flatMap(function (resolved) {
                return resolved.analyzedBundle.contents.map(function (resource) {
                    return resource.fileDescription.content;
                });
            })
            .join('\n');
        assert.match(contents, /\bvalue0\b/u);
        assert.doesNotMatch(contents, /\bvalue1\b/u, 'Unused exports must actually be eliminated');
    } else if (execution.scenario.crossPackage) {
        assert.ok(
            result.value.some(function (resolved) {
                return resolved.analyzedBundle.linkedBundleDependencies.size > 0;
            }),
            'Cross-package substitution must actually occur'
        );
    }
}

function repeatedWork(first: WorkMetrics, second: WorkMetrics): WorkMetrics {
    assert.ok(first.sourceBytesRead > 0, 'First operation must read compiler inputs');
    assert.ok(first.eliminationParsedBytes > 0, 'First operation must parse dead-code analysis inputs');
    assert.ok(first.integrityParsedBytes > 0, 'First operation must run declaration integrity checks');
    return {
        ...second,
        repeatedResolutionFraction: second.sourceBytesRead / first.sourceBytesRead,
        repeatedEliminationFraction: second.eliminationParsedBytes / first.eliminationParsedBytes,
        repeatedIntegrityFraction: second.integrityParsedBytes / first.integrityParsedBytes
    };
}

export async function executePipeline(execution: PipelineExecution): Promise<WorkMetrics> {
    await match(execution.scenario.mode)
        .with('batch', 'pack-then-publish', async function () {
            await packBatch(execution);
        })
        .with('folder', 'tar', 'zip', async function (format) {
            await packSingle(execution, format);
        })
        .with('publish', 'repeat-publish', async function () {
            await publishDryRun(execution);
        })
        .with('analysis', async function () {
            await analyze(execution);
        })
        .exhaustive();
    const first = execution.pipeline.metrics();
    if (execution.scenario.integrity) {
        assert.ok(first.integrityParsedBytes > 0, 'Integrity workload must exercise the real checker');
    }
    if ([ 'pack-then-publish', 'repeat-publish' ].includes(execution.scenario.mode)) {
        execution.pipeline.reset();
        await publishDryRun(execution);
        return repeatedWork(first, execution.pipeline.metrics());
    }
    return first;
}

export async function verifyPipelineExecution(fileManager: FileManager, execution: PipelineExecution): Promise<void> {
    const artifact = {
        projectFolder: execution.projectFolder,
        outputPath: execution.outputPath,
        vendorFiles: execution.workload.vendorFiles
    };
    const artifacts: readonly PipelineArtifact[] = match(execution.scenario.mode)
        .with('batch', 'pack-then-publish', function () {
            return execution.workload.configuration.packages.map(function (configuration) {
                return {
                    ...artifact,
                    format: 'folder' as const,
                    outputPath: path.join(execution.outputPath, configuration.name)
                };
            });
        })
        .with('folder', 'tar', 'zip', function (format) {
            return [ { ...artifact, format } ];
        })
        .otherwise(function () {
            return [];
        });
    for (const output of artifacts) {
        await verifyPipelineArtifact(fileManager, output);
    }
}
