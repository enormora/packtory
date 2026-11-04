import type { Project } from 'ts-morph';
import { isCodeFile } from '../../common/code-files.ts';
import type { ResolvedBundle } from '../../resource-resolver/resolved-bundle.ts';
import { indexPublicModules } from '../../package-surface/package-surface-index.ts';
import { buildExecutableField } from '../../package-surface/executable-field.ts';
import { buildExportsField } from '../../package-surface/export-map.ts';
import {
    declarationCompanionCandidates,
    isDeclarationCompanionFilePath
} from '../../common/declaration-companion-paths.ts';
import { inspectWorkspaceImports, type WorkspaceImport } from './workspace-imports.ts';
import { inspectModuleSymbols } from './workspace-symbols.ts';

type SnapshotBundle = Pick<ResolvedBundle, 'contents' | 'name' | 'roots' | 'surface'>;
type Dependencies = Readonly<Record<string, string>>;
export type WorkspaceSnapshot = {
    readonly imports: readonly WorkspaceImport[];
    readonly files: readonly { readonly sourcePath: string; readonly path: string; readonly sizeBytes: number; }[];
    readonly modules: readonly {
        readonly specifier: string;
        readonly values: readonly string[];
        readonly types: readonly string[];
        readonly complete: boolean;
    }[];
    readonly dependencies: Dependencies;
    readonly peerDependencies: Dependencies;
    readonly exports: string;
    readonly executables: string;
};

type Manifest = {
    readonly dependencies: Dependencies | undefined;
    readonly peerDependencies: Dependencies | undefined;
};

export type WorkspaceInspector = (bundle: SnapshotBundle, manifest: Manifest) => WorkspaceSnapshot;
type CreateProject = () => Project;

function projectForBundle(bundle: SnapshotBundle, declarations: boolean, createProject: CreateProject): Project {
    const project = createProject();
    for (const resource of bundle.contents) {
        const file = resource.fileDescription;
        if (isCodeFile(file.targetFilePath) && isDeclarationCompanionFilePath(file.targetFilePath) === declarations) {
            project.createSourceFile(file.targetFilePath, file.content);
        }
    }
    return project;
}

function inspectModules(bundle: SnapshotBundle, createProject: CreateProject): WorkspaceSnapshot['modules'] {
    const runtime = projectForBundle(bundle, false, createProject);
    const declarations = projectForBundle(bundle, true, createProject);
    return Array.from(indexPublicModules(bundle).inputFilePathBySpecifier, function ([ specifier, inputPath ]) {
        const resource = bundle.contents.find(function (entry) {
            return entry.fileDescription.inputFilePath === inputPath;
        });
        if (resource === undefined) {
            return { specifier, values: [], types: [], complete: false };
        }
        const target = resource.fileDescription.targetFilePath;
        const declarationPath = declarationCompanionCandidates(target).find(function (candidate) {
            return declarations.getSourceFile(candidate) !== undefined;
        });
        const values = inspectModuleSymbols(runtime.getSourceFile(target));
        const types = inspectModuleSymbols(declarations.getSourceFile(declarationPath ?? target));
        return {
            specifier,
            values: values.values,
            types: types.types,
            complete: values.complete && (declarationPath === undefined || types.complete)
        };
    });
}

export function createWorkspaceInspector(createProject: CreateProject): WorkspaceInspector {
    return function inspectWorkspace(bundle, manifest) {
        return {
            files: bundle
                .contents
                .filter(function (resource) {
                    return resource.isGeneratedManifest !== true;
                })
                .map(function (resource) {
                    const file = resource.fileDescription;
                    return {
                        sourcePath: file.inputFilePath,
                        path: file.targetFilePath,
                        sizeBytes: Buffer.byteLength(file.content)
                    };
                }),
            modules: inspectModules(bundle, createProject),
            imports: inspectWorkspaceImports(bundle),
            dependencies: manifest.dependencies ?? {},
            peerDependencies: manifest.peerDependencies ?? {},
            exports: JSON.stringify(buildExportsField(bundle, new Set())),
            executables: JSON.stringify(buildExecutableField(bundle) ?? {})
        };
    };
}
