import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget } from 'ts-morph';

interface FileDescription {
    filePath: string;
    content: string;
}

interface Options {
    withFiles?: FileDescription[];
    module?: ModuleKind;
}

export function createProject(options: Options = {}): Project {
    const { withFiles = [], module = ModuleKind.Node16 } = options;
    const project = new Project({
        compilerOptions: {
            allowJs: true,
            module,
            esModuleInterop: true,
            target: ScriptTarget.ES2022,
            moduleResolution: ModuleResolutionKind.Node10,
        },
        useInMemoryFileSystem: true,
    });

    for (const file of withFiles) {
        project.createSourceFile(file.filePath, file.content);
    }

    return project;
}
