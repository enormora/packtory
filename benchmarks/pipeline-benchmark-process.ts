import assert from 'node:assert/strict';
import fileSystem from 'node:fs/promises';
import { createFileManager } from '../source/file-manager/file-manager.ts';
import { registrySettingsSchema } from '../source/configuration/registry-settings.ts';
import { parsePerformanceWorkload } from './benchmark-file-codecs.ts';
import { pipelineCases, createPipelineWorkload } from './pipeline-workload.ts';
import { createBenchmarkPipeline } from './benchmark-pipeline.ts';
import { executePipeline, verifyPipelineExecution } from './pipeline-execution.ts';
import { prepareCommandLineConfiguration, executeCommandLinePipeline } from './pipeline-command-line.ts';

const argumentStartIndex = 2;
const [ name, rawRegistry, rawDefinition ] = process.argv.slice(argumentStartIndex);
assert.ok(
    name !== undefined && rawRegistry !== undefined && rawDefinition !== undefined,
    'Missing pipeline benchmark arguments'
);
const scenario = pipelineCases.find(function (candidate) {
    return candidate.name === name;
});
assert.ok(scenario !== undefined, `Unknown pipeline benchmark: ${name}`);
const fileManager = createFileManager({ hostFileSystem: fileSystem });
const projectFolder = process.cwd();
const workload = await createPipelineWorkload(fileManager, {
    rootDirectory: projectFolder,
    scenario,
    definition: parsePerformanceWorkload(JSON.parse(rawDefinition)),
    registrySettings: registrySettingsSchema.parse(JSON.parse(rawRegistry))
});
const pipeline = createBenchmarkPipeline(fileManager, {
    repositoryFolder: projectFolder,
    sourceFiles: workload.sourceFiles,
    reachableFiles: workload.reachableFiles,
    inventoryFiles: workload.vendorFiles
});
const execution = { pipeline, workload, scenario, projectFolder, outputPath: `${projectFolder}/output` };
if (scenario.commandLine) {
    await prepareCommandLineConfiguration(fileManager, execution);
}
const started = performance.now();
const metrics = scenario.commandLine ? await executeCommandLinePipeline(execution) : await executePipeline(execution);
const durationMilliseconds = performance.now() - started;
await verifyPipelineExecution(fileManager, execution);
process.stdout.write(`${JSON.stringify({ durationMilliseconds, metrics })}\n`);
