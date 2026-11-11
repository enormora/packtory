import type { Project } from 'ts-morph';
import { declarationCompanionCandidates } from '../common/declaration-companion-paths.ts';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import { getEntryRootTargetFilePaths } from '../package-surface/root-registry.ts';
import { createSideEffectClassifier, type SideEffectClassifier } from './side-effect-classifier.ts';
import type { EliminationInput } from './analyzed-bundle.ts';
import { buildReachabilityIndex, type ReachabilityIndex, type ReachabilityInput } from './reachability/reachability.ts';
import type { DeadCodeEliminationTrace } from './trace.ts';
import { loadResource, type LoadedResource } from './load-resource.ts';
import { prepareLoadedResources } from './prepare-loaded-resources.ts';

type FileBindings = ReachabilityInput['files'][number];

export type CreateProject = () => Project;

export type LoadedBundle = {
    readonly classifySideEffects: SideEffectClassifier;
    readonly input: EliminationInput;
    readonly loaded: readonly LoadedResource[];
    readonly fileBindings: readonly FileBindings[];
    readonly reachability: ReachabilityIndex;
};

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
                originalLineFor: entry.originalLineFor,
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

function entryRootFilePathsFor(
    bundle: LinkedBundle,
    substitutionPublicModuleInputFilePaths: ReadonlySet<string>
): ReadonlySet<string> {
    const targetPathsByInputPath = targetFilePathByInputFilePath(bundle.contents);
    return new Set([
        ...getEntryRootTargetFilePaths(bundle),
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
    const loaded = prepareLoadedResources(
        input.bundle.contents.map(function (resource) {
            return loadResource(runtimeProject, declarationProject, resource, input.transformationsEnabled);
        }),
        input,
        trace
    );
    const fileBindings = buildFileBindings(loaded);
    const classifySideEffects = createSideEffectClassifier(fileBindings);
    const reachability = buildReachabilityIndex({
        bundleName: input.bundle.name,
        files: fileBindings,
        entryPointFilePaths: entryRootFilePathsFor(input.bundle, input.substitutionPublicModuleInputFilePaths),
        deadCodeElimination: input.deadCodeElimination,
        classifySideEffects,
        trace
    });
    return { input, loaded, fileBindings, reachability, classifySideEffects };
}
