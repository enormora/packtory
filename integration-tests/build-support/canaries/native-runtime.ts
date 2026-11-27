import { execFile as executeFile } from 'node:child_process';
import { Project } from 'ts-morph';
import {
    createNodeImportProbe,
    inspectPackageApplicationProgrammingInterfaces,
    type CanaryProcessExecutor,
    type InspectPackagesInput
} from '../../../source/build-support/canaries/package-application-programming-interface-inspection.ts';

export const executeNativeCanaryProcess: CanaryProcessExecutor = executeFile;
export const nativeNodePath = process.execPath;

export function createNativeCanaryRuntime(): Pick<InspectPackagesInput, 'createProject' | 'runImportProbe'> {
    return {
        createProject(options) {
            return new Project(options);
        },
        runImportProbe: createNodeImportProbe(10_000, executeNativeCanaryProcess, nativeNodePath)
    };
}

export function createNativeCanaryInspector(fileManager: InspectPackagesInput['fileManager']) {
    return async function (output: Pick<InspectPackagesInput, 'nodeModulesFolder' | 'nodeTypeDefinitionsFolder'>) {
        return await inspectPackageApplicationProgrammingInterfaces({
            ...output,
            ...createNativeCanaryRuntime(),
            fileManager
        });
    };
}
