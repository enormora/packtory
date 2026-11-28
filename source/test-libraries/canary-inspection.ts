import {
    inspectPackageFolders,
    readGeneratedPackageFolders,
    type InspectPackagesInput,
    type PackageApplicationProgrammingInterfaceInspection
} from '../build-support/canaries/package-application-programming-interface-inspection.ts';

export async function inspectPackageApplicationProgrammingInterfaces(
    input: InspectPackagesInput
): Promise<PackageApplicationProgrammingInterfaceInspection> {
    return await inspectPackageFolders(input, await readGeneratedPackageFolders(input));
}
