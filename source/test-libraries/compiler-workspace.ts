import assert from 'node:assert';
import fileSystem from 'node:fs/promises';
import { tmpdir as temporaryDirectory } from 'node:os';
import path from 'node:path';
import { RealFileSystemHost } from '@ts-morph/common';
import { Project, type FileSystemHost, type ProjectOptions } from 'ts-morph';
import { createAnalysisStorage, type AnalysisStorage } from '../checks/analysis-storage.ts';
import {
    createCompilerInputValidator,
    type CompilerInputValidator
} from '../dependency-scanner/compiler-input-validator.ts';
import { createFileManager, type FileManager } from '../file-manager/file-manager.ts';

export type CompilerWorkspace = {
    readonly folder: string;
    readonly inputValidator: CompilerInputValidator;
    readonly storage: AnalysisStorage;
    readonly fileManager: FileManager;
    readonly fileSystemHost: FileSystemHost;
    readonly Project: typeof Project;
    readonly projectCount: () => number;
    readonly write: (relativePath: string, content: string) => Promise<string>;
    readonly remove: () => Promise<void>;
};
type WorkspaceDependencies = Pick<CompilerWorkspace, 'fileManager' | 'fileSystemHost' | 'folder' | 'remove'>;

export function createCompilerWorkspace(dependencies: WorkspaceDependencies): CompilerWorkspace {
    const { folder, fileManager, fileSystemHost, remove } = dependencies;
    let projectCount = 0;
    return {
        folder,
        fileManager,
        fileSystemHost,
        remove,
        inputValidator: createCompilerInputValidator(fileManager),
        storage: createAnalysisStorage({
            fileManager,
            repositoryFolder: folder,
            async toolIdentity() {
                return 'test';
            }
        }),
        Project: new Proxy(Project, {
            construct(projectConstructor, [ options ]: readonly (Readonly<ProjectOptions> | undefined)[]) {
                projectCount += 1;
                const project: unknown = Reflect.construct(projectConstructor, [ {
                    ...options,
                    fileSystem: options?.fileSystem ?? fileSystemHost,
                    compilerOptions: { ...options?.compilerOptions, noLib: true, types: [] }
                } ]);
                assert.ok(project instanceof Project);
                return project;
            }
        }),
        projectCount() {
            return projectCount;
        },
        async write(relativePath, content) {
            const filePath = path.join(folder, relativePath);
            await fileManager.writeFile(filePath, content);
            return filePath;
        }
    };
}

export async function withCompilerWorkspace(run: (workspace: CompilerWorkspace) => Promise<void>): Promise<void> {
    const folder = await fileSystem.mkdtemp(path.join(temporaryDirectory(), 'packtory-compiler-'));
    const workspace = createCompilerWorkspace({
        folder,
        fileManager: createFileManager({ hostFileSystem: fileSystem }),
        fileSystemHost: new RealFileSystemHost(),
        async remove() {
            await fileSystem.rm(folder, { recursive: true, force: true });
        }
    });
    try {
        await run(workspace);
    } finally {
        await workspace.remove();
    }
}

export function createProjectWithUntrackedInputs(projectConstructor: typeof Project): typeof Project {
    return new Proxy(projectConstructor, {
        construct(target, parameters: readonly unknown[]) {
            const project: unknown = Reflect.construct(target, parameters);
            assert.ok(project instanceof Project);
            const host = project.getFileSystem();
            const glob: unknown = Reflect.get(host, 'globSync');
            if (typeof glob !== 'function') {
                throw new TypeError('Expected a filesystem glob method');
            }
            Reflect.apply(glob, host, [ [] ]);
            return project;
        }
    });
}
