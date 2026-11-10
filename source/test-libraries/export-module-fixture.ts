import type { SourceFile } from 'ts-morph';
import { readModuleExportModel, type ModuleExportModel } from '../dead-code-eliminator/exports/module-export-model.ts';
import type { ExportTargetResolver } from '../dead-code-eliminator/exports/module-export-resolver.ts';
import { resolveRuntimeModule } from '../dead-code-eliminator/runtime-module-resolution.ts';
import { createProject } from './typescript-project.ts';

export type ExportModuleFixture = {
    readonly sources: readonly SourceFile[];
    readonly models: ReadonlyMap<SourceFile, ModuleExportModel>;
    readonly source: (name: string) => SourceFile;
    readonly resolveModule: ExportTargetResolver;
};

export function createExportModuleFixture(
    files: Readonly<Record<string, string>>,
    omitted: readonly string[]
): ExportModuleFixture {
    const project = createProject({
        withFiles: [
            { filePath: '/repo/package.json', content: '{"type":"module"}' },
            ...Object.entries(files).map(function ([ name, content ]) {
                return { filePath: `/repo/${name}`, content };
            })
        ]
    });
    const sources = project.getSourceFiles();
    return {
        sources,
        models: new Map(
            sources
                .filter(function (source) {
                    return !omitted.includes(source.getBaseName());
                })
                .map(function (source) {
                    return [ source, readModuleExportModel(source) ];
                })
        ),
        source(name) {
            return project.getSourceFileOrThrow(`/repo/${name}`);
        },
        resolveModule(source, specifier) {
            return resolveRuntimeModule(specifier, source);
        }
    };
}
