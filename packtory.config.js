// @ts-check
import path from 'node:path';
import fs from 'node:fs/promises';

const projectFolder = process.cwd();
const sourcesFolder = path.join(projectFolder, 'target/build/source');

const npmToken = process.env.NPM_TOKEN;

/** @returns {Promise<import('./source/packages/command-line-interface/command-line-interface.entry-point.ts').PacktoryConfig>} */
export async function buildConfig() {
    const packageJsonContent = await fs.readFile('./package.json', { encoding: 'utf8' });
    const packageJson = JSON.parse(packageJsonContent);

    if (npmToken === undefined) {
        throw new Error('Missing NPM_TOKEN environment variable');
    }

    return {
        registrySettings: { token: npmToken },
        commonPackageSettings: {
            sourcesFolder,
            mainPackageJson: packageJson,
            includeSourceMapFiles: true,
            additionalFiles: [
                {
                    sourceFilePath: path.join(projectFolder, 'LICENSE'),
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
                entryPoints: [
                    {
                        js: 'packages/packtory/packtory.entry-point.js',
                        declarationFile: 'packages/packtory/packtory.entry-point.d.ts'
                    }
                ],
                additionalPackageJsonAttributes: {
                    description: 'Enable customized npm package bundling and publishing using packtory’s versatile API.'
                },
                additionalFiles: [
                    {
                        sourceFilePath: 'packages/packtory/readme.md',
                        targetFilePath: 'readme.md'
                    }
                ]
            },
            {
                name: '@packtory/cli',
                entryPoints: [
                    {
                        js: 'packages/command-line-interface/command-line-interface.entry-point.js',
                        declarationFile: 'packages/command-line-interface/command-line-interface.entry-point.d.ts'
                    }
                ],
                additionalPackageJsonAttributes: {
                    bin: {
                        packtory: './command-line-interface.entry-point.js'
                    },
                    description:
                        'Effortlessly bundle and publish npm packages from the command line with @packtory/cli.'
                },
                additionalFiles: [
                    {
                        sourceFilePath: 'packages/command-line-interface/readme.md',
                        targetFilePath: 'readme.md'
                    }
                ],
                bundleDependencies: ['packtory']
            }
        ]
    };
}
