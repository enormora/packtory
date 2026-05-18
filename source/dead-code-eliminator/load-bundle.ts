import type { Project, SourceFile } from 'ts-morph';
import { isCodeFile, isDeclarationCodeFile } from '../common/code-files.ts';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import { getEntryRootIds } from '../package-surface/root-registry.ts';
import type { EliminationInput } from './analyzed-bundle.ts';
import { extractTopLevelBindings, type BindingDescriptor } from './reachability/binding-extractor.ts';
import type { FileBindings } from './reachability/local-seed-gathering.ts';
import { buildReachabilityIndex, type ReachabilityIndex } from './reachability/reachability.ts';

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
    readonly loaded: readonly LoadedResource[];
    readonly fileBindings: readonly FileBindings[];
    readonly reachability: ReachabilityIndex;
};

function projectForResource(
    runtimeProject: Project,
    declarationProject: Project,
    resource: LinkedBundleResource
): Project {
    return isDeclarationCodeFile(resource.fileDescription.targetFilePath) ? declarationProject : runtimeProject;
}

function loadResource(
    runtimeProject: Project,
    declarationProject: Project,
    resource: LinkedBundleResource
): LoadedResource {
    if (!isCodeFile(resource.fileDescription.targetFilePath)) {
        return { resource };
    }
    const project = projectForResource(runtimeProject, declarationProject, resource);
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

function entryRootFilePathsFor(bundle: LinkedBundle): ReadonlySet<string> {
    const entryRootIds = getEntryRootIds(bundle);
    const paths = new Set<string>();
    for (const rootId of entryRootIds) {
        const root = bundle.roots[rootId];
        if (root === undefined) {
            throw new Error(`Bundle "${bundle.name}" is missing root "${rootId}" referenced by its entry surface`);
        }

        paths.add(root.js.sourceFilePath);
        if (root.declarationFile !== undefined) {
            paths.add(root.declarationFile.sourceFilePath);
        }
    }
    return paths;
}

export function loadBundle(createProject: CreateProject, input: EliminationInput): LoadedBundle {
    const runtimeProject = createProject();
    const declarationProject = createProject();
    const loaded = input.bundle.contents.map((resource) => {
        return loadResource(runtimeProject, declarationProject, resource);
    });
    const fileBindings = buildFileBindings(loaded);
    const reachability = buildReachabilityIndex({
        files: fileBindings,
        entryPointFilePaths: entryRootFilePathsFor(input.bundle),
        deadCodeElimination: input.deadCodeElimination
    });
    return { input, loaded, fileBindings, reachability };
}
