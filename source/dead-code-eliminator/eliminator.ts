import { Project, type SourceFile } from 'ts-morph';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import {
    createEmptyFileAnalysis,
    type AnalyzedBundle,
    type AnalyzedBundleResource,
    type DeadCodeEliminator,
    type EliminationInput,
    type FileAnalysis
} from './analyzed-bundle.ts';
import { buildCrossBundleSeeds, type CrossBundleInput } from './cross-bundle/cross-bundle-seeds.ts';
import { extractTopLevelBindings, type BindingDescriptor } from './reachability/binding-extractor.ts';
import { bindingId, computeReachability, type FileBindings } from './reachability/reachability.ts';
import { classifySideEffects } from './side-effect-classifier.ts';
import { computeSideEffectsField, isCodeFile } from './side-effects-field.ts';
import { applyRemovalPlan } from './transform/declaration-remover.ts';

function createIsolatedProject(): Project {
    return new Project({});
}

type LoadedCodeResource = {
    readonly resource: LinkedBundleResource;
    readonly sourceFile: SourceFile;
    readonly bindings: readonly BindingDescriptor[];
};

type LoadedNonCodeResource = {
    readonly resource: LinkedBundleResource;
    readonly sourceFile?: undefined;
};

type LoadedResource = LoadedCodeResource | LoadedNonCodeResource;

type LoadedBundle = {
    readonly input: EliminationInput;
    readonly project: Project;
    readonly loaded: readonly LoadedResource[];
    readonly fileBindings: readonly FileBindings[];
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

function entryPointFilePaths(bundle: LinkedBundle): ReadonlySet<string> {
    const paths = new Set<string>();
    for (const entryPoint of bundle.entryPoints) {
        paths.add(entryPoint.js.sourceFilePath);
        if (entryPoint.declarationFile !== undefined) {
            paths.add(entryPoint.declarationFile.sourceFilePath);
        }
    }
    return paths;
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

function loadBundle(input: EliminationInput): LoadedBundle {
    const project = createIsolatedProject();
    const loaded = input.bundle.contents.map((resource) => {
        return loadResource(project, resource);
    });
    const fileBindings = buildFileBindings(loaded);
    return { input, project, loaded, fileBindings };
}

function allBindingNamesFor(loaded: LoadedCodeResource): ReadonlySet<string> {
    const names = new Set<string>();
    for (const binding of loaded.bindings) {
        names.add(binding.name);
    }
    return names;
}

function reachableBindingsFor(loaded: LoadedCodeResource, reachable: ReadonlySet<string>): ReadonlySet<string> {
    const { sourceFilePath } = loaded.resource.fileDescription;
    const surviving = new Set<string>();
    for (const binding of loaded.bindings) {
        if (reachable.has(bindingId(sourceFilePath, binding.name))) {
            surviving.add(binding.name);
        }
    }
    return surviving;
}

function transformedContent(sourceFile: SourceFile, surviving: ReadonlySet<string>): string {
    applyRemovalPlan(sourceFile, { survivingNames: surviving });
    return sourceFile.getFullText();
}

type AnalysisContext = {
    readonly reachable: ReadonlySet<string>;
    readonly transformationsEnabled: boolean;
};

type CodeAnalysis = {
    readonly analysis: FileAnalysis;
    readonly reachableBindings: ReadonlySet<string>;
    readonly shouldTransform: boolean;
};

function analyzeCodeFile(loaded: LoadedCodeResource, context: AnalysisContext): CodeAnalysis {
    const sideEffectStatements = classifySideEffects(loaded.sourceFile);
    const reachableBindings = reachableBindingsFor(loaded, context.reachable);
    const shouldTransform = context.transformationsEnabled && sideEffectStatements.length === 0;
    const survivingBindings = shouldTransform ? reachableBindings : allBindingNamesFor(loaded);
    return {
        analysis: { survivingBindings, sideEffectStatements, sideEffectImports: new Set<string>() },
        reachableBindings,
        shouldTransform
    };
}

function buildAnalyzedResource(loaded: LoadedResource, context: AnalysisContext): AnalyzedBundleResource {
    if (loaded.sourceFile === undefined) {
        return { ...loaded.resource, analysis: createEmptyFileAnalysis() };
    }
    const { analysis, reachableBindings, shouldTransform } = analyzeCodeFile(loaded, context);
    if (!shouldTransform) {
        return { ...loaded.resource, analysis };
    }
    const newContent = transformedContent(loaded.sourceFile, reachableBindings);
    return {
        ...loaded.resource,
        fileDescription: { ...loaded.resource.fileDescription, content: newContent },
        analysis
    };
}

function crossBundleInputFrom(loaded: LoadedBundle): CrossBundleInput {
    const sourceFiles: SourceFile[] = [];
    for (const entry of loaded.loaded) {
        if (entry.sourceFile !== undefined) {
            sourceFiles.push(entry.sourceFile);
        }
    }
    return {
        bundle: loaded.input.bundle,
        sourceFiles,
        fileBindings: loaded.fileBindings
    };
}

function dropStaleSourceMaps(
    contents: readonly AnalyzedBundleResource[],
    transformedTargetPaths: ReadonlySet<string>
): readonly AnalyzedBundleResource[] {
    const stalePaths = new Set<string>();
    for (const transformed of transformedTargetPaths) {
        stalePaths.add(`${transformed}.map`);
    }
    return contents.filter((resource) => {
        return !stalePaths.has(resource.fileDescription.targetFilePath);
    });
}

function analyzeBundleWithSeeds(loaded: LoadedBundle, externalSeeds: ReadonlySet<string> | undefined): AnalyzedBundle {
    const { reachable } = computeReachability({
        files: loaded.fileBindings,
        entryPointFilePaths: entryPointFilePaths(loaded.input.bundle),
        externalSeeds
    });
    const context: AnalysisContext = {
        reachable,
        transformationsEnabled: loaded.input.transformationsEnabled
    };
    const transformedTargetPaths = new Set<string>();
    const contents = loaded.loaded.map((entry) => {
        const result = buildAnalyzedResource(entry, context);
        if (result.fileDescription.content !== entry.resource.fileDescription.content) {
            transformedTargetPaths.add(result.fileDescription.targetFilePath);
        }
        return result;
    });
    const cleanedContents = dropStaleSourceMaps(contents, transformedTargetPaths);
    return {
        ...loaded.input.bundle,
        contents: cleanedContents,
        sideEffectsField: computeSideEffectsField(cleanedContents)
    };
}

export function createDeadCodeEliminator(): DeadCodeEliminator {
    return {
        async eliminate(inputs) {
            const loadedBundles = inputs.map(loadBundle);
            const seedMap = buildCrossBundleSeeds(loadedBundles.map(crossBundleInputFrom));
            return loadedBundles.map((loaded) => {
                return analyzeBundleWithSeeds(loaded, seedMap.get(loaded.input.bundle.name));
            });
        }
    };
}
