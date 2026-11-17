import type { Project, SourceFile } from 'ts-morph';
import { createSourcePreparation, type SourcePreparation } from '../source-transformation/source-preparation.ts';
import { isCodeFile, isDeclarationCodeFile } from '../common/code-files.ts';
import type { LinkedBundleResource } from '../linker/linked-bundle.ts';
import {
    captureBindingLocations,
    extractTopLevelBindings,
    type BindingDescriptor,
    type BindingLocation
} from './reachability/binding-extractor.ts';
import { prepareInitialRuntimeSource } from './transform/runtime-source-preparation.ts';

export type LoadedCodeResource = SourcePreparation & {
    readonly resource: LinkedBundleResource;
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

function parseResource(
    runtimeProject: Project,
    declarationProject: Project,
    resource: LinkedBundleResource
): SourceFile | undefined {
    if (!isCodeFile(resource.fileDescription.targetFilePath)) {
        return undefined;
    }
    const project = projectForResource(runtimeProject, declarationProject, resource);
    return project.createSourceFile(
        parseFilePathFor(resource),
        resource.fileDescription.content,
        { overwrite: true }
    );
}

function prepareResource(
    resource: LinkedBundleResource,
    sourceFile: SourceFile | undefined,
    transformationsEnabled: boolean
): LoadedResource {
    if (sourceFile === undefined) {
        return { resource, sourceFile: undefined };
    }
    const preparation = createSourcePreparation(sourceFile);
    const symbolLocations = captureBindingLocations(extractTopLevelBindings(sourceFile));
    if (transformationsEnabled && !isDeclarationCodeFile(resource.fileDescription.targetFilePath)) {
        prepareInitialRuntimeSource(preparation);
    }
    return { resource, ...preparation, bindings: extractTopLevelBindings(sourceFile), symbolLocations };
}

export function loadResources(
    runtimeProject: Project,
    declarationProject: Project,
    resources: readonly LinkedBundleResource[],
    transformationsEnabled: boolean
): readonly LoadedResource[] {
    const sources = resources.map(function (resource) {
        return parseResource(runtimeProject, declarationProject, resource);
    });
    return resources.map(function (resource, index) {
        return prepareResource(resource, sources[index], transformationsEnabled);
    });
}
