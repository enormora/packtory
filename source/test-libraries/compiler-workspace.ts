import fileSystem from 'node:fs/promises';
import path from 'node:path';
import { tmpdir as temporaryDirectory } from 'node:os';
import assert from 'node:assert';
import { Project, type ProjectOptions } from 'ts-morph';
import { RealFileSystemHost } from '@ts-morph/common';
import { createFileManager, type FileManager } from '../file-manager/file-manager.ts';
import {
    createCompilerInputValidator,
    type CompilerInputValidator
} from '../dependency-scanner/compiler-input-validator.ts';
import { createAnalysisStorage, type AnalysisStorage } from '../checks/analysis-storage.ts';

export type CompilerWorkspace = {
    readonly folder: string;
    readonly inputValidator: CompilerInputValidator;
    readonly storage: AnalysisStorage;
    readonly fileManager: FileManager;
    readonly fileSystemHost: RealFileSystemHost;
    readonly Project: typeof Project;
    readonly projectCount: () => number;
    readonly write: (relativePath: string, content: string) => Promise<string>;
    readonly remove: () => Promise<void>;
};

async function createCompilerWorkspace(): Promise<CompilerWorkspace> {
    const folder = await fileSystem.mkdtemp(path.join(temporaryDirectory(), 'packtory-compiler-'));
    const fileManager = createFileManager({ hostFileSystem: fileSystem });
    let projectCount = 0;
    return {
        folder,
        inputValidator: createCompilerInputValidator(fileManager),
        storage: createAnalysisStorage({
            fileManager,
            repositoryFolder: folder,
            async toolIdentity() {
                return 'test';
            }
        }),
        fileManager,
        fileSystemHost: new RealFileSystemHost(),
        Project: new Proxy(Project, {
            construct(projectConstructor, [ options ]: readonly (Readonly<ProjectOptions> | undefined)[]) {
                projectCount += 1;
                const project: unknown = Reflect.construct(projectConstructor, [ {
                    ...options,
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
        },
        async remove() {
            await fileSystem.rm(folder, { recursive: true, force: true });
        }
    };
}

export async function withCompilerWorkspace(
    run: (workspace: CompilerWorkspace) => Promise<void>
): Promise<void> {
    const workspace = await createCompilerWorkspace();
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
