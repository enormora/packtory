// @ts-check
import path from 'node:path';
import fileSystem from 'node:fs/promises';

const projectFolder = process.cwd();
const sourcesFolder = path.join(projectFolder, 'target/build/source');

const sharedLicensePath = path.join(projectFolder, 'LICENSE');
const packtoryReadmePath = path.join(projectFolder, 'source/packages/packtory/readme.md');
const commandLineInterfaceReadmePath = path.join(projectFolder, 'source/packages/command-line-interface/readme.md');
const githubReleaseGateReadmePath = path.join(projectFolder, 'source/packages/github-release-gate/readme.md');
const bootstrapNpmPackageReadmePath = path.join(projectFolder, 'source/packages/bootstrap-npm-package/readme.md');

const noSideEffectsAllowList = [
    'packages/packtory/packtory.entry-point.js',
    'bundle-emitter/repository-coherence.js',
    'packages/package-processor.composition.js',
    'tar/tarball-builder.js',
    'configuration/packtory-configuration-without-registry-schema.js',
    'bundle-emitter/registry/publish-settings-bridge.js',
    'bundle-emitter/publish-error/publish-error-messages.js',
    'dead-code-eliminator/side-effect-classifier.js',
    'dead-code-eliminator/statement-classifiers.js',
    'dead-code-eliminator/syntax-kind-sets.js',
    'dead-code-eliminator/pure-expression.js',
    'dead-code-eliminator/transform/declaration-remover.js',
    'dead-code-eliminator/transform/named-declaration-kinds.js',
    'software-bill-of-materials/software-bill-of-materials-builder.js',
    'configuration/checks-schema.js',
    'configuration/package-schemas.js',
    'packages/command-line-interface/command-line-interface.entry-point.js',
    'packages/command-line-interface/spinner-boot.entry-point.js',
    'command-line-interface/preview-input-output/preview-input-output.js',
    'packages/command-line-interface/spinner-worker.entry-point.js',
    'packages/github-release-gate/github-release-gate.entry-point.js',
    'packages/bootstrap-npm-package/bootstrap-npm-package.entry-point.js'
]
    .map(function (filePath) {
        return path.join(sourcesFolder, filePath);
    });

/**
@returns {Promise<import('./source/packages/command-line-interface/command-line-interface.entry-point.ts').PacktoryConfiguration>}
*/
export async function buildConfiguration() {
    const packageManifestContent = await fileSystem.readFile('./package.json', { encoding: 'utf8' });
    const packageManifest = JSON.parse(packageManifestContent);

    return {
        registrySettings: {
            authentication: {
                publish: { type: 'npm-open-identity-connect', provider: 'automatic' },
                metadata: 'automatic'
            }
        },
        checks: {
            typeScriptIntegrity: { enabled: true, declarations: 'all' },
            noDuplicatedFiles: { enabled: true, allowList: [ sharedLicensePath ] },
            requiredFiles: { enabled: true, files: [ 'LICENSE', 'readme.md' ] },
            maximumBundleSize: { enabled: true, bytes: 1_050_000 },
            noUnusedBundleDependencies: { enabled: true },
            noDevelopmentDependencyImports: { enabled: true },
            uniqueTargetPaths: { enabled: true },
            noSideEffects: { enabled: true, allowList: noSideEffectsAllowList },
            noUnexposedExecutables: { enabled: true },
            nodeEngineCompatibility: { enabled: true }
        },
        commonPackageSettings: {
            sourcesFolder,
            mainPackageManifest: packageManifest,
            includeSourceMapFiles: true,
            deadCodeElimination: {
                enabled: true,
                pureImports: [
                    { from: 'zod/mini' },
                    { from: 'yoctocolors', imports: [ 'bold', 'dim', 'green', 'red', 'yellow' ] }
                ],
                pureConstructors: [ 'Set', 'Map', 'TextEncoder', 'TextDecoder' ]
            },
            publishSettings: {
                access: 'public',
                provenance: { type: 'automatic' }
            },
            additionalFiles: [
                {
                    inputFilePath: sharedLicensePath,
                    targetFilePath: 'LICENSE'
                }
            ],
            additionalPackageManifestAttributes: {
                repository: packageManifest.repository,
                license: packageManifest.license,
                keywords: packageManifest.keywords,
                author: packageManifest.author,
                contributors: packageManifest.contributors,
                engines: packageManifest.engines
            }
        },
        packages: [
            {
                name: 'packtory',
                exportPackageManifest: true,
                checks: { maximumBundleSize: { bytes: 1_680_000 } },
                roots: {
                    main: {
                        javaScript: 'packages/packtory/packtory.entry-point.js',
                        declarationFile: 'packages/packtory/packtory.entry-point.d.ts'
                    }
                },
                additionalPackageManifestAttributes: {
                    description: 'Enable customized npm package bundling and publishing using packtory’s versatile API.'
                },
                additionalFiles: [
                    {
                        inputFilePath: packtoryReadmePath,
                        targetFilePath: 'readme.md'
                    }
                ]
            },
            {
                name: '@packtory/github-release-gate',
                exportPackageManifest: true,
                roots: {
                    main: {
                        javaScript: 'packages/github-release-gate/github-release-gate.entry-point.js'
                    }
                },
                packageInterface: {
                    executables: [ { root: 'main', name: 'github-release-gate' } ]
                },
                additionalPackageManifestAttributes: {
                    description: 'GitHub Actions release gate that batches packtory publishes by waiting ' +
                        'for repository activity to settle.'
                },
                additionalFiles: [
                    {
                        inputFilePath: githubReleaseGateReadmePath,
                        targetFilePath: 'readme.md'
                    }
                ],
                bundleDependencies: [ 'packtory' ]
            },
            {
                name: '@packtory/cli',
                exportPackageManifest: true,
                roots: {
                    commandLineInterface: {
                        javaScript: 'packages/command-line-interface/command-line-interface.entry-point.js',
                        declarationFile: 'packages/command-line-interface/command-line-interface.entry-point.d.ts'
                    },
                    spinnerWorker: {
                        javaScript: 'packages/command-line-interface/spinner-worker.entry-point.js'
                    }
                },
                packageInterface: {
                    executables: [ { root: 'commandLineInterface', name: 'packtory' } ],
                    privateRoots: [ 'spinnerWorker' ]
                },
                additionalPackageManifestAttributes: {
                    description:
                        'Effortlessly bundle and publish npm packages from the command line with @packtory/cli.'
                },
                additionalFiles: [
                    {
                        inputFilePath: commandLineInterfaceReadmePath,
                        targetFilePath: 'readme.md'
                    }
                ],
                bundleDependencies: [ 'packtory' ]
            },
            {
                name: '@packtory/bootstrap-npm-package',
                exportPackageManifest: true,
                roots: {
                    main: {
                        javaScript: 'packages/bootstrap-npm-package/bootstrap-npm-package.entry-point.js'
                    }
                },
                packageInterface: {
                    executables: [ { root: 'main', name: 'bootstrap-npm-package' } ]
                },
                additionalPackageManifestAttributes: {
                    description: 'Claim a brand-new npm name so a Trusted Publisher can be configured for it ' +
                        '(workaround for npm/cli#8544).'
                },
                additionalFiles: [
                    {
                        inputFilePath: bootstrapNpmPackageReadmePath,
                        targetFilePath: 'readme.md'
                    }
                ],
                bundleDependencies: [ 'packtory' ]
            }
        ]
    };
}
