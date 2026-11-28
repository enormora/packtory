import { execFile as executeFile } from 'node:child_process';
import fileSystem from 'node:fs';
import { parentPort, Worker as WorkerThread, workerData } from 'node:worker_threads';
import { Project } from 'ts-morph';
import { z } from 'zod';
import { errorMessage } from '../../common/error-normalization.ts';
import { createFileManager } from '../../file-manager/file-manager.ts';
import {
    createNodeImportProbe,
    inspectPackageFolders,
    readGeneratedPackageFolders,
    type CanaryPackageOutput,
    type InspectPackagesInput,
    type PackageApplicationProgrammingInterfaceInspection
} from './package-application-programming-interface-inspection.ts';

const packageInspectionWorkFields = {
    folders: z.array(z.object({ name: z.string(), folderPath: z.string() })),
    nodeModulesFolder: z.string(),
    nodeTypeDefinitionsFolder: z.string()
};
const packageInspectionWork = z.object(packageInspectionWorkFields);

type PackageInspectionWork = CanaryPackageOutput & {
    readonly folders: Parameters<typeof inspectPackageFolders>[1];
};

const minimumParallelRunnerCores = 4;
const inspectionGroupCount = 2;
const importProbeTimeoutMilliseconds = 10_000;
const inspectionRuntime: Pick<InspectPackagesInput, 'createProject' | 'fileManager' | 'runImportProbe'> = {
    createProject(options) {
        return new Project(options);
    },
    fileManager: createFileManager({ hostFileSystem: fileSystem.promises }),
    runImportProbe: createNodeImportProbe(importProbeTimeoutMilliseconds, executeFile, process.execPath)
};

async function inspectOnWorker(work: PackageInspectionWork): Promise<PackageApplicationProgrammingInterfaceInspection> {
    return new Promise(function (resolve, reject) {
        const worker = new WorkerThread(new URL(import.meta.url), { workerData: work });
        let result: PackageApplicationProgrammingInterfaceInspection | null = null;
        let failure: Error | null = null;
        worker.once('message', function (inspection: PackageApplicationProgrammingInterfaceInspection) {
            result = inspection;
        });
        worker.once('error', function (error: Error) {
            failure = error;
        });
        worker.once('exit', function (code) {
            if (code === 0 && result !== null) {
                resolve(result);
            } else {
                reject(failure ?? new Error(`Canary package inspection worker exited with code ${code}`));
            }
        });
    });
}

export async function inspectCanaryPackages(
    output: CanaryPackageOutput,
    runnerCores: number
): Promise<PackageApplicationProgrammingInterfaceInspection> {
    const input = { ...output, ...inspectionRuntime };
    const folders = await readGeneratedPackageFolders(input);
    if (runnerCores < minimumParallelRunnerCores || folders.length < inspectionGroupCount) {
        return await inspectOnWorker({ ...output, folders });
    }
    const groupSize = Math.ceil(folders.length / inspectionGroupCount);
    const inspections = await Promise.allSettled([
        inspectOnWorker({ ...output, folders: folders.slice(0, groupSize) }),
        inspectOnWorker({ ...output, folders: folders.slice(groupSize) })
    ]);
    return {
        packages: inspections.flatMap(function (inspection) {
            if (inspection.status === 'rejected') {
                throw new Error(errorMessage(inspection.reason));
            }
            return inspection.value.packages;
        })
    };
}

if (parentPort !== null) {
    const work = packageInspectionWork.parse(workerData);
    parentPort.postMessage(await inspectPackageFolders({ ...work, ...inspectionRuntime }, work.folders), []);
}
