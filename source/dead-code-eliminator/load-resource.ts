import type { Project } from 'ts-morph';
import { createSourcePreparation, type SourcePreparation } from '../source-transformation/source-preparation.ts';
import { isCodeFile, isDeclarationCodeFile } from '../common/code-files.ts';
import type { LinkedBundleResource } from '../linker/linked-bundle.ts';
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
): CodeResourceSource | LoadedNonCodeResource {
    if (!isCodeFile(resource.fileDescription.targetFilePath)) {
        return { resource, sourceFile: undefined };
    }
    const project = projectForResource(runtimeProject, declarationProject, resource);
    const sourceFile = project.createSourceFile(
        parseFilePathFor(resource),
        resource.fileDescription.content,
        { overwrite: true }
    );
    return { resource, ...createSourcePreparation(sourceFile) };
}

export function loadResources(
    runtimeProject: Project,
    declarationProject: Project,
    resources: readonly LinkedBundleResource[]
): readonly LoadedResource[] {
    const loaded = resources.map(function (resource) {
        return loadResource(runtimeProject, declarationProject, resource);
    });
    return loaded.map(function (entry) {
        if (entry.sourceFile === undefined) {
            return entry;
        }
        const bindings = extractTopLevelBindings(entry.sourceFile);
        return { ...entry, bindings, symbolLocations: captureBindingLocations(bindings) };
    });
}
