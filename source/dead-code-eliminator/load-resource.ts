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

export function loadResource(
    runtimeProject: Project,
    declarationProject: Project,
    resource: LinkedBundleResource
): LoadedResource {
    if (!isCodeFile(resource.fileDescription.targetFilePath)) {
        return { resource, sourceFile: undefined };
    }
    const project = projectForResource(runtimeProject, declarationProject, resource);
    const sourceFile = project.createSourceFile(
        parseFilePathFor(resource),
        resource.fileDescription.content,
        { overwrite: true }
    );
    const preparation = createSourcePreparation(sourceFile);
    const bindings = extractTopLevelBindings(sourceFile);
    const symbolLocations = captureBindingLocations(bindings);
    return { resource, ...preparation, bindings, symbolLocations };
}
