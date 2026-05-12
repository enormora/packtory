import type { Project, SourceFile } from 'ts-morph';
import { isCodeFile } from '../common/code-files.ts';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import type { EliminationInput } from './analyzed-bundle.ts';
import { extractTopLevelBindings, type BindingDescriptor } from './reachability/binding-extractor.ts';
import { buildReachabilityIndex, type FileBindings, type ReachabilityIndex } from './reachability/reachability.ts';

export type CreateProject = () => Project;

export type LoadedCodeResource = {
    readonly resource: LinkedBundleResource;
    readonly sourceFile: SourceFile;
    readonly bindings: readonly BindingDescriptor[];
};

type LoadedNonCodeResource = {
    readonly resource: LinkedBundleResource;
    readonly sourceFile?: undefined;
};

export type LoadedResource = LoadedCodeResource | LoadedNonCodeResource;

export type LoadedBundle = {
    readonly input: EliminationInput;
    readonly project: Project;
    readonly loaded: readonly LoadedResource[];
    readonly fileBindings: readonly FileBindings[];
    readonly reachability: ReachabilityIndex;
};

function loadResource(project: Project, resource: LinkedBundleResource): LoadedResource {
    if (!isCodeFile(resource.fileDescription.targetFilePath)) {
        return { resource };
    }
    const sourceFile = project.createSourceFile(
        resource.fileDescription.sourceFilePath,
        resource.fileDescription.content
    );
    return { resource, sourceFile, bindings: extractTopLevelBindings(sourceFile) };
}

function buildFileBindings(loaded: readonly LoadedResource[]): readonly FileBindings[] {
    const result: FileBindings[] = [];
    for (const entry of loaded) {
        if (entry.sourceFile !== undefined) {
            result.push({
                sourceFilePath: entry.resource.fileDescription.sourceFilePath,
                sourceFile: entry.sourceFile,
                bindings: entry.bindings
            });
        }
    }
    return result;
}

function entryPointFilePathsFor(bundle: LinkedBundle): ReadonlySet<string> {
    const paths = new Set<string>();
    for (const entryPoint of bundle.entryPoints) {
        paths.add(entryPoint.js.sourceFilePath);
        if (entryPoint.declarationFile !== undefined) {
            paths.add(entryPoint.declarationFile.sourceFilePath);
        }
    }
    return paths;
}

export function loadBundle(createProject: CreateProject, input: EliminationInput): LoadedBundle {
    const project = createProject();
    const loaded = input.bundle.contents.map((resource) => {
        return loadResource(project, resource);
    });
    const fileBindings = buildFileBindings(loaded);
    const reachability = buildReachabilityIndex({
        files: fileBindings,
        entryPointFilePaths: entryPointFilePathsFor(input.bundle)
    });
    return { input, project, loaded, fileBindings, reachability };
}
