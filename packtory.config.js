// @ts-check
import path from 'node:path';
import fs from 'node:fs/promises';

// cspell:ignore yoctocolors

const projectFolder = process.cwd();
const sourcesFolder = path.join(projectFolder, 'target/build/source');

const npmToken = process.env.NPM_TOKEN;
const allowAnonymousMetadataDryRun = process.env.PACKTORY_DRY_RUN_ANONYMOUS_METADATA === '1';
const dryRunPublishToken = 'dry-run-only-token';
const sharedLicensePath = path.join(projectFolder, 'LICENSE');
const packtoryReadmePath = path.join(projectFolder, 'source/packages/packtory/readme.md');
const cliReadmePath = path.join(projectFolder, 'source/packages/command-line-interface/readme.md');

const noSideEffectsAllowList = [
    'packages/packtory/packtory.entry-point.js',
    'bundle-emitter/repository-coherence.js',
    'packages/package-processor.composition.js',
    'tar/tarball-builder.js',
    'config/packtory-config-without-registry-schema.js',
    'bundle-emitter/publish-settings-bridge.js',
    'dead-code-eliminator/side-effect-classifier.js',
    'dead-code-eliminator/transform/declaration-remover.js',
    'sbom/sbom-builder.js',
    'config/checks-schema.js',
    'config/package-schemas.js',
    'packages/command-line-interface/command-line-interface.entry-point.js',
    'packages/command-line-interface/spinner-boot.entry-point.js',
    'command-line-interface/preview-io.js',
    'packages/command-line-interface/spinner-worker.entry-point.js'
].map((filePath) => {
    return path.join(sourcesFolder, filePath);
});

function resolveRegistryAuth() {
    if (npmToken !== undefined) {
        return { type: 'bearer-token', token: npmToken };
    }
    if (!allowAnonymousMetadataDryRun) {
        throw new Error('Missing NPM_TOKEN environment variable');
    }
    return {
        publish: { type: 'bearer-token', token: dryRunPublishToken },
        metadata: 'anonymous'
    };
}

/** @returns {Promise<import('./source/packages/command-line-interface/command-line-interface.entry-point.ts').PacktoryConfig>} */
export async function buildConfig() {
    const packageJsonContent = await fs.readFile('./package.json', { encoding: 'utf8' });
    const packageJson = JSON.parse(packageJsonContent);

    return {
        registrySettings: {
            auth: resolveRegistryAuth()
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
            publishSettings: { access: 'public' },
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
                name: '@packtory/cli',
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
            }
        ]
    };
}
