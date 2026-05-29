// @ts-check
import path from 'node:path';
import fs from 'node:fs/promises';

// cspell:ignore yoctocolors

const projectFolder = process.cwd();
const sourcesFolder = path.join(projectFolder, 'target/build/source');

const sharedLicensePath = path.join(projectFolder, 'LICENSE');
const packtoryReadmePath = path.join(projectFolder, 'source/packages/packtory/readme.md');
const cliReadmePath = path.join(projectFolder, 'source/packages/command-line-interface/readme.md');
const githubReleaseGateReadmePath = path.join(projectFolder, 'source/packages/github-release-gate/readme.md');
const bootstrapNpmPackageReadmePath = path.join(projectFolder, 'source/packages/bootstrap-npm-package/readme.md');

const noSideEffectsAllowList = [
    'packages/packtory/packtory.entry-point.js',
    'bundle-emitter/repository-coherence.js',
    'packages/package-processor.composition.js',
    'tar/tarball-builder.js',
    'config/packtory-config-without-registry-schema.js',
    'bundle-emitter/registry/publish-settings-bridge.js',
    'bundle-emitter/publish-error/publish-error-messages.js',
    'dead-code-eliminator/side-effect-classifier.js',
    'dead-code-eliminator/statement-classifiers.js',
    'dead-code-eliminator/syntax-kind-sets.js',
    'dead-code-eliminator/pure-expression.js',
    'dead-code-eliminator/transform/declaration-remover.js',
    'dead-code-eliminator/transform/named-declaration-kinds.js',
    'sbom/sbom-builder.js',
    'config/checks-schema.js',
    'config/package-schemas.js',
    'packages/command-line-interface/command-line-interface.entry-point.js',
    'packages/command-line-interface/spinner-boot.entry-point.js',
    'command-line-interface/preview-io/preview-io.js',
    'packages/command-line-interface/spinner-worker.entry-point.js',
    'packages/github-release-gate/github-release-gate.entry-point.js',
    'packages/bootstrap-npm-package/bootstrap-npm-package.entry-point.js'
].map((filePath) => {
    return path.join(sourcesFolder, filePath);
});

/** @returns {Promise<import('./source/packages/command-line-interface/command-line-interface.entry-point.ts').PacktoryConfig>} */
export async function buildConfig() {
    const packageJsonContent = await fs.readFile('./package.json', { encoding: 'utf8' });
    const packageJson = JSON.parse(packageJsonContent);

    return {
        registrySettings: {
            auth: {
                publish: { type: 'npm-oidc', provider: 'auto' },
                metadata: 'auto'
            }
        },
        checks: {
            noDuplicatedFiles: { enabled: true, allowList: [sharedLicensePath] },
            requiredFiles: { enabled: true, files: ['LICENSE', 'readme.md'] },
            maxBundleSize: { enabled: true, bytes: 1_000_000 },
            noUnusedBundleDependencies: { enabled: true },
            noDevDependencyImports: { enabled: true },
            uniqueTargetPaths: { enabled: true },
            noSideEffects: { enabled: true, allowList: noSideEffectsAllowList }
        },
        commonPackageSettings: {
            sourcesFolder,
            mainPackageJson: packageJson,
            includeSourceMapFiles: true,
            deadCodeElimination: {
                enabled: true,
                pureImports: [
                    { from: 'zod/mini' },
                    { from: 'yoctocolors', imports: ['bold', 'dim', 'green', 'red', 'yellow'] }
                ],
                pureConstructors: ['Set', 'Map', 'TextEncoder', 'TextDecoder']
            },
            publishSettings: {
                access: 'public',
                provenance: { type: 'auto' }
            },
            additionalFiles: [
                {
                    sourceFilePath: sharedLicensePath,
                    targetFilePath: 'LICENSE'
                }
            ],
            additionalPackageJsonAttributes: {
                repository: packageJson.repository,
                license: packageJson.license,
                keywords: packageJson.keywords,
                author: packageJson.author,
                contributors: packageJson.contributors,
                engines: packageJson.engines
            }
        },
        packages: [
            {
                name: 'packtory',
                exportPackageJson: true,
                roots: {
                    main: {
                        js: 'packages/packtory/packtory.entry-point.js',
                        declarationFile: 'packages/packtory/packtory.entry-point.d.ts'
                    }
                },
                additionalPackageJsonAttributes: {
                    description: 'Enable customized npm package bundling and publishing using packtory’s versatile API.'
                },
                additionalFiles: [
                    {
                        sourceFilePath: packtoryReadmePath,
                        targetFilePath: 'readme.md'
                    }
                ]
            },
            {
                name: '@packtory/github-release-gate',
                exportPackageJson: true,
                roots: {
                    main: {
                        js: 'packages/github-release-gate/github-release-gate.entry-point.js'
                    }
                },
                packageInterface: {
                    bins: [{ root: 'main', name: 'github-release-gate' }]
                },
                additionalPackageJsonAttributes: {
                    description:
                        'GitHub Actions release gate that batches packtory publishes by waiting ' +
                        'for repository activity to settle.'
                },
                additionalFiles: [
                    {
                        sourceFilePath: githubReleaseGateReadmePath,
                        targetFilePath: 'readme.md'
                    }
                ],
                bundleDependencies: ['packtory']
            },
            {
                name: '@packtory/cli',
                exportPackageJson: true,
                roots: {
                    cli: {
                        js: 'packages/command-line-interface/command-line-interface.entry-point.js',
                        declarationFile: 'packages/command-line-interface/command-line-interface.entry-point.d.ts'
                    },
                    spinnerWorker: {
                        js: 'packages/command-line-interface/spinner-worker.entry-point.js'
                    }
                },
                packageInterface: {
                    bins: [{ root: 'cli', name: 'packtory' }],
                    privateRoots: ['spinnerWorker']
                },
                additionalPackageJsonAttributes: {
                    description:
                        'Effortlessly bundle and publish npm packages from the command line with @packtory/cli.'
                },
                additionalFiles: [
                    {
                        sourceFilePath: cliReadmePath,
                        targetFilePath: 'readme.md'
                    }
                ],
                bundleDependencies: ['packtory']
            },
            {
                name: '@packtory/bootstrap-npm-package',
                exportPackageJson: true,
                roots: {
                    main: {
                        js: 'packages/bootstrap-npm-package/bootstrap-npm-package.entry-point.js'
                    }
                },
                packageInterface: {
                    bins: [{ root: 'main', name: 'bootstrap-npm-package' }]
                },
                additionalPackageJsonAttributes: {
                    description:
                        'Claim a brand-new npm name so a Trusted Publisher can be configured for it ' +
                        '(workaround for npm/cli#8544).'
                },
                additionalFiles: [
                    {
                        sourceFilePath: bootstrapNpmPackageReadmePath,
                        targetFilePath: 'readme.md'
                    }
                ]
            }
        ]
    };
}
