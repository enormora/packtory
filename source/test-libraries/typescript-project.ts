import assert from 'node:assert';
import { InMemoryFileSystemHost, ModuleKind, ModuleResolutionKind, Project, ScriptTarget } from 'ts-morph';
import { observeCompilerInputs } from '../dependency-scanner/compiler-inputs.ts';

type FileDescription = {
    readonly filePath: string;
    readonly content: string;
};

type Options = {
    readonly withFiles?: readonly FileDescription[];
    readonly module?: ModuleKind;
};

export function createProject(options: Options = {}): Project {
    const { withFiles = [], module = ModuleKind.Node16 } = options;
    const project = new Project({
        compilerOptions: {
            allowJs: true,
            module,
            esModuleInterop: true,
            noLib: true,
            target: ScriptTarget.ES2022,
            moduleResolution: ModuleResolutionKind.Node16,
            resolveJsonModule: true
        },
        skipLoadingLibFiles: true,
        useInMemoryFileSystem: true
    });

    for (const file of withFiles) {
        project.createSourceFile(file.filePath, file.content);
    }

    return project;
}

type ObservedProject = {
    readonly project: Project;
    readonly assertUnread: (filePath: string) => void;
};

export async function createObservedProject(files: readonly FileDescription[]): Promise<ObservedProject> {
    const observation = observeCompilerInputs(new InMemoryFileSystemHost());
    for (const file of files) {
        await observation.fileSystemHost.writeFile(file.filePath, file.content);
    }
    return {
        project: new Project({
            fileSystem: observation.fileSystemHost,
            skipLoadingLibFiles: true,
            compilerOptions: { allowJs: true, noLib: true, types: [] }
        }),
        assertUnread(filePath) {
            const inputs = observation.snapshot();
            if (inputs === null) {
                assert.fail('Expected reusable compiler input observations');
            }
            assert.strictEqual(
                inputs.some(function (input) {
                    return input.operation === 'readFile' && input.filePath === filePath;
                }),
                false
            );
        }
    };
}
