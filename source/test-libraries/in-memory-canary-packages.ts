import path from 'node:path';
import { omit } from 'remeda';
import { Project, type ProjectOptions } from 'ts-morph';
import type { FileManager } from '../file-manager/file-manager.ts';
import { withInMemoryCompilerWorkspace } from './in-memory-compiler-workspace.ts';

type CanaryPackages = {
    readonly fileManager: FileManager;
    readonly nodeModulesFolder: string;
    readonly createProject: (options: ProjectOptions) => Project;
};

const globalTypes = [
    'interface Object {}',
    'interface Function {}',
    'interface CallableFunction extends Function {}',
    'interface NewableFunction extends Function {}',
    'interface Boolean {}',
    'interface Number {}',
    'interface String {}',
    'interface RegExp {}',
    'interface IArguments { length: number; [index: number]: unknown; }',
    'interface Array<T> { length: number; [index: number]: T; }'
]
    .join('\n');

export async function withInMemoryCanaryPackages(run: (packages: CanaryPackages) => Promise<void>): Promise<void> {
    await withInMemoryCompilerWorkspace(async function (workspace) {
        const nodeModulesFolder = path.join(workspace.folder, 'node_modules');
        await workspace.fileSystemHost.mkdir(nodeModulesFolder);
        await workspace.write('runtime-types/node/index.d.ts', '');
        await run({
            fileManager: workspace.fileManager,
            nodeModulesFolder,
            createProject(options) {
                const project = new Project({
                    ...options,
                    fileSystem: workspace.fileSystemHost,
                    compilerOptions: { ...omit(options.compilerOptions ?? {}, [ 'lib' ]), noLib: true }
                });
                project.createSourceFile('/canary-globals.d.ts', globalTypes);
                return project;
            }
        });
    });
}
