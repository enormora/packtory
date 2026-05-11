import { Project, type SourceFile } from 'ts-morph';
import { isCodeFile } from '../common/code-files.ts';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import type { EliminationInput } from './analyzed-bundle.ts';
import { extractTopLevelBindings, type BindingDescriptor } from './reachability/binding-extractor.ts';
import { computeReachability, type FileBindings } from './reachability/reachability.ts';

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
    readonly localReachable: ReadonlySet<string>;
    readonly entryPointFilePaths: ReadonlySet<string>;
};

function createIsolatedProject(): Project {
    return new Project({});
}

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

export function loadBundle(input: EliminationInput): LoadedBundle {
    const project = createIsolatedProject();
    const loaded = input.bundle.contents.map((resource) => {
        return loadResource(project, resource);
    });
    const fileBindings = buildFileBindings(loaded);
    const entryPointFilePaths = entryPointFilePathsFor(input.bundle);
    const { reachable: localReachable } = computeReachability({
        files: fileBindings,
        entryPointFilePaths
    });
    return { input, project, loaded, fileBindings, localReachable, entryPointFilePaths };
}
