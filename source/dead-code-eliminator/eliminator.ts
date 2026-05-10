import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget, type SourceFile } from 'ts-morph';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import type {
    AnalyzedBundle,
    AnalyzedBundleResource,
    DeadCodeEliminator,
    EliminationInput,
    FileAnalysis
} from './analyzed-bundle.ts';
import { buildCrossBundleSeeds, type CrossBundleInput, type SeedMap } from './cross-bundle/cross-bundle-seeds.ts';
import { extractTopLevelBindings, type BindingDescriptor } from './reachability/binding-extractor.ts';
import { bindingId, computeReachability, type FileBindings } from './reachability/reachability.ts';
import { classifySideEffects } from './side-effect-classifier.ts';
import { computeSideEffectsField, isCodeFile } from './side-effects-field.ts';
import { applyRemovalPlan } from './transform/declaration-remover.ts';

const emptyAnalysis: FileAnalysis = {
    survivingBindings: new Set<string>(),
    sideEffectStatements: [],
    sideEffectImports: new Set<string>()
};

function createInMemoryProject(): Project {
    return new Project({
        compilerOptions: {
            allowJs: true,
            module: ModuleKind.Node16,
            esModuleInterop: true,
            noLib: true,
            target: ScriptTarget.ES2022,
            moduleResolution: ModuleResolutionKind.Node10
        },
        skipLoadingLibFiles: true,
        useInMemoryFileSystem: true
    });
}

type LoadedResource = {
    readonly resource: LinkedBundleResource;
    readonly sourceFile: SourceFile | undefined;
    readonly bindings: readonly BindingDescriptor[];
};

type LoadedBundle = {
    readonly input: EliminationInput;
    readonly project: Project;
    readonly loaded: readonly LoadedResource[];
    readonly fileBindings: readonly FileBindings[];
};

function loadResource(project: Project, resource: LinkedBundleResource): LoadedResource {
    if (!isCodeFile(resource.fileDescription.targetFilePath)) {
        return { resource, sourceFile: undefined, bindings: [] };
    }
    const sourceFile = project.createSourceFile(
        resource.fileDescription.sourceFilePath,
        resource.fileDescription.content,
        { overwrite: true }
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
    return loaded.flatMap((entry) => {
        if (entry.sourceFile === undefined) {
            return [];
        }
        return [
            {
                sourceFilePath: entry.resource.fileDescription.sourceFilePath,
                sourceFile: entry.sourceFile,
                bindings: entry.bindings
            }
        ];
    });
}

function loadBundle(input: EliminationInput): LoadedBundle {
    const project = createInMemoryProject();
    const loaded = input.bundle.contents.map((resource) => {
        return loadResource(project, resource);
    });
    const fileBindings = buildFileBindings(loaded);
    return { input, project, loaded, fileBindings };
}

function allBindingNamesFor(loaded: LoadedResource): ReadonlySet<string> {
    return new Set(
        loaded.bindings.map((binding) => {
            return binding.name;
        })
    );
}

function reachableBindingsFor(loaded: LoadedResource, reachable: ReadonlySet<string>): ReadonlySet<string> {
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

function computeFileAnalysis(
    loaded: LoadedResource,
    context: AnalysisContext,
    sideEffectStatements: ReturnType<typeof classifySideEffects>
): { readonly analysis: FileAnalysis; readonly reachableBindings: ReadonlySet<string> } {
    const reachableBindings = reachableBindingsFor(loaded, context.reachable);
    const fileHasSideEffects = sideEffectStatements.length > 0;
    const survivingBindings =
        context.transformationsEnabled && !fileHasSideEffects ? reachableBindings : allBindingNamesFor(loaded);
    return {
        analysis: { survivingBindings, sideEffectStatements, sideEffectImports: new Set<string>() },
        reachableBindings
    };
}

function buildAnalyzedResource(loaded: LoadedResource, context: AnalysisContext): AnalyzedBundleResource {
    if (loaded.sourceFile === undefined) {
        return { ...loaded.resource, analysis: emptyAnalysis };
    }
    const sideEffectStatements = classifySideEffects(loaded.sourceFile);
    const { analysis, reachableBindings } = computeFileAnalysis(loaded, context, sideEffectStatements);
    if (!context.transformationsEnabled || sideEffectStatements.length > 0) {
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
    const sourceFiles = loaded.loaded.flatMap((entry) => {
        return entry.sourceFile === undefined ? [] : [entry.sourceFile];
    });
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
    if (transformedTargetPaths.size === 0) {
        return contents;
    }
    return contents.filter((resource) => {
        const targetPath = resource.fileDescription.targetFilePath;
        if (!targetPath.endsWith('.map')) {
            return true;
        }
        const baseTarget = targetPath.slice(0, -'.map'.length);
        return !transformedTargetPaths.has(baseTarget);
    });
}

function analyzeBundleWithSeeds(loaded: LoadedBundle, externalSeeds: ReadonlySet<string>): AnalyzedBundle {
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
        if (
            entry.sourceFile !== undefined &&
            result.fileDescription.content !== entry.resource.fileDescription.content
        ) {
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

function emptyOrSeed(seeds: SeedMap, bundleName: string): ReadonlySet<string> {
    return seeds.get(bundleName) ?? new Set<string>();
}

export function createDeadCodeEliminator(): DeadCodeEliminator {
    return {
        async eliminate(inputs) {
            const loadedBundles = inputs.map(loadBundle);
            const seedMap = buildCrossBundleSeeds(loadedBundles.map(crossBundleInputFrom));
            return loadedBundles.map((loaded) => {
                return analyzeBundleWithSeeds(loaded, emptyOrSeed(seedMap, loaded.input.bundle.name));
            });
        }
    };
}
