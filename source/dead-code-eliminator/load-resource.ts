import type { Project } from 'ts-morph';
import { createSourcePreparation, type SourcePreparation } from '../source-transformation/source-preparation.ts';
import { isCodeFile, isDeclarationCodeFile } from '../common/code-files.ts';
import type { LinkedBundleResource } from '../linker/linked-bundle.ts';
import { establishIntrinsicIntegrity } from './evaluation/intrinsic-integrity.ts';
import {
    captureBindingLocations,
    extractTopLevelBindings,
    type BindingDescriptor,
    type BindingLocation
} from './reachability/binding-extractor.ts';

type CodeResourceSource = SourcePreparation & {
    readonly resource: LinkedBundleResource;
};

export type LoadedCodeResource = CodeResourceSource & {
    readonly bindings: readonly BindingDescriptor[];
    readonly symbolLocations: readonly BindingLocation[];
};

type LoadedNonCodeResource = {
    readonly resource: LinkedBundleResource;
    readonly sourceFile: undefined;
};

export type LoadedResource = LoadedCodeResource | LoadedNonCodeResource;

function parseFilePathFor(resource: LinkedBundleResource): string {
    return `/.packtory-artifacts/${resource.fileDescription.targetFilePath}`;
}

function projectsForResources(createProject: () => Project): (resource: LinkedBundleResource) => Project {
    let runtimeProject: Project | null = null;
    let declarationProject: Project | null = null;
    return function (resource) {
        if (isDeclarationCodeFile(resource.fileDescription.targetFilePath)) {
            declarationProject = declarationProject ?? createProject();
            return declarationProject;
        }
        runtimeProject = runtimeProject ?? createProject();
        return runtimeProject;
    };
}

function loadResource(
    projectForResource: (resource: LinkedBundleResource) => Project,
    resource: LinkedBundleResource
): CodeResourceSource | LoadedNonCodeResource {
    if (!isCodeFile(resource.fileDescription.targetFilePath)) {
        return { resource, sourceFile: undefined };
    }
    const project = projectForResource(resource);
    const sourceFile = project.createSourceFile(
        parseFilePathFor(resource),
        resource.fileDescription.content,
        { overwrite: true }
    );
    return { resource, ...createSourcePreparation(sourceFile) };
}

export function loadResources(
    createProject: () => Project,
    resources: readonly LinkedBundleResource[]
): readonly LoadedResource[] {
    const projectForResource = projectsForResources(createProject);
    const loaded = resources.map(function (resource) {
        return loadResource(projectForResource, resource);
    });
    establishIntrinsicIntegrity(loaded.flatMap(function (entry) {
        return entry.sourceFile ?? [];
    }));
    return loaded.map(function (entry) {
        if (entry.sourceFile === undefined) {
            return entry;
        }
        const bindings = extractTopLevelBindings(entry.sourceFile);
        return { ...entry, bindings, symbolLocations: captureBindingLocations(bindings) };
    });
}
