import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget } from 'ts-morph';

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
