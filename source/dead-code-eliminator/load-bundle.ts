import type { Project, SourceFile } from 'ts-morph';
import { declarationCompanionCandidates } from '../common/declaration-companion-paths.ts';
import { isCodeFile, isDeclarationCodeFile } from '../common/code-files.ts';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import { getEntryRootIds } from '../package-surface/root-registry.ts';
import type { EliminationInput } from './analyzed-bundle.ts';
import { extractTopLevelBindings, type BindingDescriptor } from './reachability/binding-extractor.ts';
import type { FileBindings } from './reachability/local-seed-gathering.ts';
import { buildReachabilityIndex, type ReachabilityIndex } from './reachability/reachability.ts';
import type { DeadCodeEliminationTrace } from './trace.ts';

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
): LoadedResource {
    if (!isCodeFile(resource.fileDescription.targetFilePath)) {
        return { resource };
    }
    const project = projectForResource(runtimeProject, declarationProject, resource);
    const sourceFile = project.createSourceFile(
        parseFilePathFor(resource),
        resource.fileDescription.content,
        { overwrite: true }
    );
    return { resource, sourceFile, bindings: extractTopLevelBindings(sourceFile) };
}

function buildFileBindings(loaded: readonly LoadedResource[]): readonly FileBindings[] {
    const result: FileBindings[] = [];
    for (const entry of loaded) {
        if (entry.sourceFile !== undefined) {
            result.push({
                inputFilePath: entry.resource.fileDescription.inputFilePath,
                parsedInputFilePath: entry.sourceFile.getFilePath(),
                targetFilePath: entry.resource.fileDescription.targetFilePath,
                moduleReferences: entry.resource.moduleReferences,
                sourceFile: entry.sourceFile,
                bindings: entry.bindings
            });
        }
    }
    return result;
}

function targetFilePathByInputFilePath(resources: readonly LinkedBundleResource[]): ReadonlyMap<string, string> {
    return new Map(
        resources.map(function (resource) {
            return [ resource.fileDescription.inputFilePath, resource.fileDescription.targetFilePath ];
        })
    );
}

function substitutionPublicModuleTargetPathsFor(
    substitutionPublicModuleInputFilePaths: ReadonlySet<string>,
    targetPathsByInputPath: ReadonlyMap<string, string>
): ReadonlySet<string> {
    return new Set(
        Array
            .from(
                substitutionPublicModuleInputFilePaths,
                function (inputFilePath) {
                    return targetPathsByInputPath.get(inputFilePath);
                }
            )
            .filter(function (targetFilePath): targetFilePath is string {
                return targetFilePath !== undefined;
            })
            .flatMap(function (targetFilePath) {
                return [ targetFilePath, ...declarationCompanionCandidates(targetFilePath) ];
            })
    );
}

function rootFilePathsFor(bundle: LinkedBundle, rootId: string): readonly string[] {
    const root = bundle.roots[rootId];
    if (root === undefined) {
        throw new Error(`Bundle "${bundle.name}" is missing root "${rootId}" referenced by its entry surface`);
    }
    return root.declarationFile === undefined
        ? [ root.js.targetFilePath ]
        : [ root.js.targetFilePath, root.declarationFile.targetFilePath ];
}

function entryRootFilePathsFor(
    bundle: LinkedBundle,
    substitutionPublicModuleInputFilePaths: ReadonlySet<string>
): ReadonlySet<string> {
    const targetPathsByInputPath = targetFilePathByInputFilePath(bundle.contents);
    return new Set([
        ...Array.from(getEntryRootIds(bundle)).flatMap(function (rootId) {
            return rootFilePathsFor(bundle, rootId);
        }),
        ...substitutionPublicModuleTargetPathsFor(substitutionPublicModuleInputFilePaths, targetPathsByInputPath)
    ]);
}

export function loadBundle(
    createProject: CreateProject,
    input: EliminationInput,
    trace: DeadCodeEliminationTrace
): LoadedBundle {
    const runtimeProject = createProject();
    const declarationProject = createProject();
    const loaded = input.bundle.contents.map(function (resource) {
        return loadResource(runtimeProject, declarationProject, resource);
    });
    const fileBindings = buildFileBindings(loaded);
    const reachability = buildReachabilityIndex({
        bundleName: input.bundle.name,
        files: fileBindings,
        entryPointFilePaths: entryRootFilePathsFor(input.bundle, input.substitutionPublicModuleInputFilePaths),
        deadCodeElimination: input.deadCodeElimination,
        trace
    });
    return { input, loaded, fileBindings, reachability };
}
