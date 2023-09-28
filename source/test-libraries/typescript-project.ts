import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget } from 'ts-morph';

type FileDescription = {
    readonly filePath: string;
    readonly content: string;
};

type Options = {
    readonly withFiles?: FileDescription[];
    readonly module?: ModuleKind;
};

export function createProject(options: Options = {}): Project {
    const { withFiles = [], module = ModuleKind.Node16 } = options;
    const project = new Project({
        compilerOptions: {
            allowJs: true,
            module,
            esModuleInterop: true,
            target: ScriptTarget.ES2022,
            moduleResolution: ModuleResolutionKind.Node10
        },
        useInMemoryFileSystem: true
    });

    for (const file of withFiles) {
        project.createSourceFile(file.filePath, file.content);
    }

    return project;
}
