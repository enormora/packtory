import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget, type SourceFile } from 'ts-morph';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import type {
    AnalyzedBundle,
    AnalyzedBundleResource,
    DeadCodeEliminator,
    EliminationInput,
    FileAnalysis
} from './analyzed-bundle.ts';
import { buildCrossBundleSeeds, type CrossBundleInput } from './cross-bundle/cross-bundle-seeds.ts';
import { extractTopLevelBindings, type BindingDescriptor } from './reachability/binding-extractor.ts';
import { bindingId, computeReachability, type FileBindings } from './reachability/reachability.ts';
import { classifySideEffects } from './side-effect-classifier.ts';
import { computeSideEffectsField, isCodeFile } from './side-effects-field.ts';
import { applyRemovalPlan } from './transform/declaration-remover.ts';

function emptyAnalysis(): FileAnalysis {
    return {
        survivingBindings: new Set<string>(),
        sideEffectStatements: [],
        sideEffectImports: new Set<string>()
    };
}

// Stryker disable all -- ts-morph project configuration is exercised structurally; per-flag mutations are equivalent for our in-memory test scenarios
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
// Stryker restore all

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
        // Stryker disable next-line ArrayDeclaration -- non-code resources never read this field; equivalent for any value
        return { resource, sourceFile: undefined, bindings: [] };
    }
    const sourceFile = project.createSourceFile(
        resource.fileDescription.sourceFilePath,
        resource.fileDescription.content,
        // Stryker disable next-line ObjectLiteral,BooleanLiteral -- overwrite is required only when re-using a project; harmless and equivalent in tests
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
    const project = createInMemoryProject();
    const loaded = input.bundle.contents.map((resource) => {
        return loadResource(project, resource);
    });
    const fileBindings = buildFileBindings(loaded);
    return { input, project, loaded, fileBindings };
}

function allBindingNamesFor(loaded: LoadedResource): ReadonlySet<string> {
    const names = new Set<string>();
    for (const binding of loaded.bindings) {
        names.add(binding.name);
    }
    return names;
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

type CodeAnalysis = {
    readonly analysis: FileAnalysis;
    readonly reachableBindings: ReadonlySet<string>;
    readonly shouldTransform: boolean;
};

function analyzeCodeFile(loaded: LoadedResource, context: AnalysisContext, sourceFile: SourceFile): CodeAnalysis {
    const sideEffectStatements = classifySideEffects(sourceFile);
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
    const { sourceFile } = loaded;
    if (sourceFile === undefined) {
        return { ...loaded.resource, analysis: emptyAnalysis() };
    }
    const { analysis, reachableBindings, shouldTransform } = analyzeCodeFile(loaded, context, sourceFile);
    if (!shouldTransform) {
        return { ...loaded.resource, analysis };
    }
    const newContent = transformedContent(sourceFile, reachableBindings);
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
