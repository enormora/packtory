import { execFile as executeFile } from 'node:child_process';
import fileSystem from 'node:fs';
import { parentPort, Worker, workerData } from 'node:worker_threads';
import { Project } from 'ts-morph';
import { errorMessage } from '../../common/error-normalization.ts';
import { createFileManager } from '../../file-manager/file-manager.ts';
import {
    createNodeImportProbe,
    inspectPackageApplicationProgrammingInterfaces,
    inspectPackageFolders,
    readGeneratedPackageFolders,
    type CanaryPackageOutput,
    type InspectPackagesInput,
    type PackageApplicationProgrammingInterfaceInspection,
    type PackageFolder
} from './package-application-programming-interface-inspection.ts';

type PackageInspectionWork = CanaryPackageOutput & {
    readonly folders: readonly PackageFolder[];
};

const minimumParallelRunnerCores = 4;
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
        const worker = new Worker(new URL(import.meta.url), { workerData: work });
        let result: PackageApplicationProgrammingInterfaceInspection | undefined;
        let failure: Error | undefined;
        worker.once('message', function (inspection: PackageApplicationProgrammingInterfaceInspection) {
            result = inspection;
        });
        worker.once('error', function (error) {
            failure = error;
        });
        worker.once('exit', function (code) {
            if (code === 0 && result !== undefined) {
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
    if (runnerCores < minimumParallelRunnerCores) {
        return await inspectPackageApplicationProgrammingInterfaces(input);
    }
    const folders = await readGeneratedPackageFolders(input);
    if (folders.length < 2) {
        return await inspectPackageFolders(input, folders);
    }
    const workerStart = Math.ceil(folders.length / 2);
    const inspections = await Promise.allSettled([
        inspectOnWorker({ ...output, folders: folders.slice(workerStart) }),
        inspectPackageFolders(input, folders.slice(0, workerStart))
    ]);
    const [ worker, local ] = inspections;
    return {
        packages: [ local, worker ].flatMap(function (inspection) {
            if (inspection.status === 'rejected') {
                throw new Error(errorMessage(inspection.reason));
            }
            return inspection.value.packages;
        })
    };
}

if (parentPort !== null) {
    const work = workerData as PackageInspectionWork;
    parentPort.postMessage(await inspectPackageFolders({ ...work, ...inspectionRuntime }, work.folders));
}
