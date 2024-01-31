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
            mainPackageJson: packageJson
        },
        packages: [
            {
                name: 'packtory',
                includeSourceMapFiles: true,
                entryPoints: [
                    {
                        js: 'packages/packtory/packtory.entry-point.js',
                        declarationFile: 'packages/packtory/packtory.entry-point.d.ts'
                    }
                ],
                additionalFiles: [
                    {
                        sourceFilePath: path.join(projectFolder, 'LICENSE'),
                        targetFilePath: 'LICENSE'
                    },
                    {
                        sourceFilePath: path.join(projectFolder, 'README.md'),
                        targetFilePath: 'readme.md'
                    }
                ]
            },
            {
                name: '@packtory/cli',
                includeSourceMapFiles: true,
                entryPoints: [
                    {
                        js: 'packages/command-line-interface/command-line-interface.entry-point.js',
                        declarationFile: 'packages/command-line-interface/command-line-interface.entry-point.d.ts'
                    }
                ],
                additionalFiles: [
                    {
                        sourceFilePath: path.join(projectFolder, 'LICENSE'),
                        targetFilePath: 'LICENSE'
                    },
                    {
                        sourceFilePath: path.join(projectFolder, 'README.md'),
                        targetFilePath: 'readme.md'
                    }
                ],
                additionalPackageJsonAttributes: {
                    bin: {
                        packtory: './command-line-interface.entry-point.js'
                    }
                },
                bundleDependencies: ['packtory']
            }
        ]
    };
}
