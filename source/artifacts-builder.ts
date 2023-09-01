import path from 'node:path';
import _pacote from 'pacote';
import ssri from 'ssri';
import { PackageJson } from 'type-fest';
import { DependencyScanner, ScanResult, combineScanResults } from './dependency-scanner';
import { FileManager } from './file-manager';
import { CodeTransformer, ProcessEnvSettings } from './code-transformer';

export interface ArtifactsBuilderDependencies {
    readonly dependencyScanner: DependencyScanner;
    readonly fileManager: FileManager;
    readonly pacote: typeof _pacote;
    readonly codeTransformer: CodeTransformer;
}

export interface BuildResult {
    readonly tarData: Buffer;
    readonly shasum: string;
    readonly packageJson: PackageJson;
}

export interface EntryPoint {
    readonly js: string;
    readonly declarationFile?: string;
}

export interface PackageMetaData {
    readonly main?: string;
    readonly types?: string;
    readonly browser?: string;
    readonly sideEffects?: boolean;
}

export interface BuildOptions {
    readonly srcFolder: string;
    readonly targetFolder: string;
    readonly entryPoints: readonly [EntryPoint, ...(readonly EntryPoint[])];
    readonly libPrefix: string;
    readonly additionalFiles: readonly string[];
    readonly fullPackageName: string;
    readonly mainPackageJson: PackageJson;
    readonly additionalPackageMetaData: PackageMetaData;
    readonly processEnvSettings?: ProcessEnvSettings;
}

export interface ArtifactsBuilder {
    build(version: string, options: BuildOptions): Promise<BuildResult>;
}

function combineAllPackageFiles(options: BuildOptions, files: readonly string[]): readonly string[] {
    const { entryPoints } = options;
    const allFiles = Array.from(files);

    entryPoints.forEach((entryPoint) => {
        allFiles.push(entryPoint.js);

        if (entryPoint.declarationFile) {
            allFiles.push(entryPoint.declarationFile);
        }
    });

    return allFiles;
}

function resolveRelativePath(prefix: string, sourcePath: string, targetPath: string): string {
    return path.join(prefix, path.relative(sourcePath, targetPath));
}

export function createArtifactsBuilder(artifactsBuilderDependencies: ArtifactsBuilderDependencies): ArtifactsBuilder {
    const { pacote, dependencyScanner, fileManager, codeTransformer } = artifactsBuilderDependencies;

    async function createPackageJson(
        options: BuildOptions,
        version: string,
        packageDependencies: Record<string, string>
    ): Promise<PackageJson> {
        const { fullPackageName, libPrefix, srcFolder, targetFolder, entryPoints, additionalPackageMetaData } = options;
        const [firstEntryPoint] = entryPoints;

        const mainEntryPoint =
            additionalPackageMetaData.main ?? resolveRelativePath(libPrefix, srcFolder, firstEntryPoint.js);

        const packageJson: PackageJson = {
            ...additionalPackageMetaData,
            name: fullPackageName,
            version,
            dependencies: packageDependencies,
            main: mainEntryPoint
        };

        let mainDeclarationFile = additionalPackageMetaData.types;

        if (!mainDeclarationFile && typeof firstEntryPoint.declarationFile === 'string') {
            mainDeclarationFile = resolveRelativePath(libPrefix, srcFolder, firstEntryPoint.declarationFile);
        }

        if (mainDeclarationFile) {
            packageJson.types = mainDeclarationFile;
        }

        await fileManager.writePackageJson(targetFolder, packageJson);

        return packageJson;
    }

    async function copyLocalFilesToTarget(
        options: BuildOptions,
        localDependencies: readonly string[]
    ): Promise<readonly string[]> {
        const { srcFolder, targetFolder, libPrefix, additionalFiles } = options;
        const allFiles = combineAllPackageFiles(options, localDependencies);
        const copyOptions = { srcFolder, targetFolder, prefixFolder: libPrefix, additionalFiles };

        return fileManager.copyFilesToTarget(allFiles, copyOptions);
    }

    async function scanDependencies(options: BuildOptions): Promise<ScanResult> {
        const { srcFolder, entryPoints, mainPackageJson } = options;
        let dependencies: ScanResult = { topLevelDependencies: {}, localFiles: [] };

        for (const entryPoint of entryPoints) {
            const jsDependencies = await dependencyScanner.scan(entryPoint.js, srcFolder, { mainPackageJson });
            dependencies = combineScanResults(dependencies, jsDependencies);

            if (entryPoint.declarationFile) {
                const declarationDependencies = await dependencyScanner.scan(entryPoint.declarationFile, srcFolder, {
                    resolveAsTypescript: true,
                    includeDevDependencies: true,
                    mainPackageJson
                });
                dependencies = combineScanResults(dependencies, declarationDependencies);
            }
        }

        return dependencies;
    }

    return {
        async build(version, options) {
            const { targetFolder, entryPoints, fullPackageName, processEnvSettings, libPrefix, srcFolder } = options;

            const dependencies = await scanDependencies(options);

            await fileManager.createCleanFolder(targetFolder);
            await copyLocalFilesToTarget(options, dependencies.localFiles);

            for (const entryPoint of entryPoints) {
                const targetEntryPointFile = path.join(
                    targetFolder,
                    libPrefix,
                    path.relative(srcFolder, entryPoint.js)
                );
                await codeTransformer.transformFile(targetEntryPointFile, {
                    processEnvSettings,
                    packageMetadata: { version, name: fullPackageName }
                });
            }

            const packageJson = await createPackageJson(options, version, dependencies.topLevelDependencies);

            const tarData = await pacote.tarball(targetFolder);
            const integrity = ssri.fromData(tarData, { algorithms: ['sha1'] });

            return {
                shasum: integrity.hexDigest(),
                tarData,
                packageJson
            };
        }
    };
}
