import path from 'node:path';
import fc from 'fast-check';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import type { ArtifactModuleReference } from '../resource-resolver/resolved-bundle.ts';
import {
    deadCodeEliminationDeclarationFileFromSource as declarationFileFromSource,
    deadCodeEliminationEventNameArbitrary as eventNameArbitrary,
    deadCodeEliminationEventPush as eventPush,
    deadCodeEliminationExpressionArbitrary as expressionArbitrary,
    deadCodeEliminationRuntimeFileFromSource as runtimeFileFromSource,
    deadCodeEliminationSingleBundleProgramFrom,
    deadCodeEliminationTargetModuleSpecifier as targetModuleSpecifier,
    type DeadCodeEliminationGeneratedBundle,
    type DeadCodeEliminationGeneratedFile,
    type GeneratedDeadCodeEliminationProgram,
    type GeneratedExpression
} from './dead-code-elimination-generated-programs.ts';

type RuntimeTargetExtension = '.js' | '.mjs';
type DeclarationTargetExtension = '.d.mts' | '.d.ts';
type InputExtension = '.mts' | '.ts';
type SourceMapMode = 'embedded-source' | 'missing-source';

type TargetLayout = {
    readonly name: string;
    readonly entryFolder: string;
    readonly featureFolder: string;
    readonly modelFolder: string;
    readonly sideEffectFolder: string;
    readonly declarationFolder: string;
};

type SourceTargetSkewInput = {
    readonly expression: GeneratedExpression;
    readonly eventName: string;
    readonly inputExtension: InputExtension;
    readonly runtimeExtension: RuntimeTargetExtension;
    readonly declarationExtension: DeclarationTargetExtension;
    readonly sourceMapMode: SourceMapMode;
    readonly targetLayout: TargetLayout;
};

type SourceTargetSkewPaths = {
    readonly entryInputPath: string;
    readonly featureInputPath: string;
    readonly modelInputPath: string;
    readonly sideEffectInputPath: string;
    readonly entryDeclarationInputPath: string;
    readonly featureDeclarationInputPath: string;
    readonly modelDeclarationInputPath: string;
    readonly entryTargetPath: string;
    readonly featureTargetPath: string;
    readonly modelTargetPath: string;
    readonly sideEffectTargetPath: string;
    readonly entryDeclarationTargetPath: string;
    readonly featureDeclarationTargetPath: string;
    readonly modelDeclarationTargetPath: string;
};

const packageName = 'pkg';
const sourceMapModes = [ 'embedded-source', 'missing-source' ] as const;
const inputExtensions = [ '.ts', '.mts' ] as const;
const runtimeTargetExtensions = [ '.js', '.mjs' ] as const;
const declarationTargetExtensions = [ '.d.ts', '.d.mts' ] as const;
const splitTargetFoldersLayout: TargetLayout = {
    name: 'split-target-folders',
    entryFolder: 'dist/public',
    featureFolder: 'dist/runtime',
    modelFolder: 'dist/runtime/nested',
    sideEffectFolder: 'dist/effects',
    declarationFolder: 'types/public'
};
const targetLayouts: readonly TargetLayout[] = [
    splitTargetFoldersLayout,
    {
        name: 'same-target-folder',
        entryFolder: 'dist',
        featureFolder: 'dist',
        modelFolder: 'dist',
        sideEffectFolder: 'dist',
        declarationFolder: 'types'
    },
    {
        name: 'source-target-folder-skew',
        entryFolder: 'package/entry',
        featureFolder: 'package/internal/feature',
        modelFolder: 'package/internal/model',
        sideEffectFolder: 'package/internal/effects',
        declarationFolder: 'package/types'
    }
];

function filePath(folder: string, name: string, extension: string): string {
    return path.posix.join(folder, `${name}${extension}`);
}

function inputPath(folder: string, name: string, extension: string): string {
    return path.posix.join('/workspace/source-inputs', folder, `${name}${extension}`);
}

function declarationInputPath(folder: string, name: string, extension: string): string {
    return path.posix.join('/workspace/declaration-inputs', folder, `${name}${extension}`);
}

function sourceMapInputPath(targetFilePath: string): string {
    return path.posix.join('/workspace/source-maps', `${targetFilePath}.map`);
}

function sourceMapTargetPath(targetFilePath: string): string {
    return `${targetFilePath}.map`;
}

function sourceMappingUrlLine(targetFilePath: string): string {
    return `//# sourceMappingURL=${path.posix.basename(sourceMapTargetPath(targetFilePath))}`;
}

function targetPathsFor(input: SourceTargetSkewInput): SourceTargetSkewPaths {
    const { targetLayout } = input;
    return {
        entryInputPath: inputPath('entry', 'index', input.inputExtension),
        featureInputPath: inputPath('domain/feature-source', 'feature', input.inputExtension),
        modelInputPath: inputPath('generated/model-source', 'model', input.inputExtension),
        sideEffectInputPath: inputPath('effects-source', 'side-effect', input.inputExtension),
        entryDeclarationInputPath: declarationInputPath('entry', 'index', input.declarationExtension),
        featureDeclarationInputPath: declarationInputPath(
            'domain/feature-source',
            'feature',
            input.declarationExtension
        ),
        modelDeclarationInputPath: declarationInputPath('generated/model-source', 'model', input.declarationExtension),
        entryTargetPath: filePath(targetLayout.entryFolder, 'index', input.runtimeExtension),
        featureTargetPath: filePath(targetLayout.featureFolder, 'feature', input.runtimeExtension),
        modelTargetPath: filePath(targetLayout.modelFolder, 'model', input.runtimeExtension),
        sideEffectTargetPath: filePath(targetLayout.sideEffectFolder, 'side-effect', input.runtimeExtension),
        entryDeclarationTargetPath: filePath(targetLayout.declarationFolder, 'index', input.declarationExtension),
        featureDeclarationTargetPath: filePath(targetLayout.declarationFolder, 'feature', input.declarationExtension),
        modelDeclarationTargetPath: filePath(targetLayout.declarationFolder, 'model', input.declarationExtension)
    };
}

function runtimeFile(
    inputFilePath: string,
    targetFilePath: string,
    lines: readonly string[],
    dependencies: readonly string[]
): DeadCodeEliminationGeneratedFile {
    return runtimeFileFromSource(
        inputFilePath,
        targetFilePath,
        [ ...lines, sourceMappingUrlLine(targetFilePath) ],
        [ ...dependencies, sourceMapTargetPath(targetFilePath) ]
    );
}

function declarationFile(
    inputFilePath: string,
    targetFilePath: string,
    lines: readonly string[]
): DeadCodeEliminationGeneratedFile {
    return declarationFileFromSource(
        inputFilePath,
        targetFilePath,
        [ ...lines, sourceMappingUrlLine(targetFilePath) ],
        [ sourceMapTargetPath(targetFilePath) ]
    );
}

function sourceMapSourcePath(targetFilePath: string, inputExtension: InputExtension): string {
    const withoutTargetExtension = targetFilePath.replace(/\.(?:js|mjs|d\.ts|d\.mts)$/u, '');
    return path.posix.join('../authored-sources', `${withoutTargetExtension}${inputExtension}`);
}

function sourceMapContent(
    input: SourceTargetSkewInput,
    targetFilePath: string,
    generatedContent: string
): string {
    const sourcesContent = input.sourceMapMode === 'embedded-source' ? [ generatedContent ] : [];
    return `${
        JSON.stringify({
            version: 3,
            file: path.posix.basename(targetFilePath),
            sources: [ sourceMapSourcePath(targetFilePath, input.inputExtension) ],
            sourcesContent,
            names: [],
            mappings: ''
        })
    }\n`;
}

function sourceMapFile(
    input: SourceTargetSkewInput,
    targetFilePath: string,
    generatedContent: string
): DeadCodeEliminationGeneratedFile {
    return {
        inputFilePath: sourceMapInputPath(targetFilePath),
        targetFilePath: sourceMapTargetPath(targetFilePath),
        content: sourceMapContent(input, targetFilePath, generatedContent),
        dependencies: []
    };
}

function entryRuntime(paths: SourceTargetSkewPaths): DeadCodeEliminationGeneratedFile {
    return runtimeFile(
        paths.entryInputPath,
        paths.entryTargetPath,
        [
            `import { featureValue } from ${
                JSON.stringify(targetModuleSpecifier(paths.entryTargetPath, paths.featureTargetPath))
            };`,
            `import ${JSON.stringify(targetModuleSpecifier(paths.entryTargetPath, paths.sideEffectTargetPath))};`,
            'const unusedEntryValue = "unused-entry";',
            'export function api() { return featureValue; }'
        ],
        [ paths.featureTargetPath, paths.sideEffectTargetPath ]
    );
}

function featureRuntime(paths: SourceTargetSkewPaths): DeadCodeEliminationGeneratedFile {
    return runtimeFile(
        paths.featureInputPath,
        paths.featureTargetPath,
        [
            `import { modelValue } from ${
                JSON.stringify(targetModuleSpecifier(paths.featureTargetPath, paths.modelTargetPath))
            };`,
            'const unusedFeatureValue = "unused-feature";',
            'export const featureValue = modelValue;',
            'export const removedFeatureValue = unusedFeatureValue;'
        ],
        [ paths.modelTargetPath ]
    );
}

function modelRuntime(input: SourceTargetSkewInput, paths: SourceTargetSkewPaths): DeadCodeEliminationGeneratedFile {
    return runtimeFile(
        paths.modelInputPath,
        paths.modelTargetPath,
        [
            eventPush(input.eventName),
            `export const modelValue = ${input.expression.source};`,
            'export const unusedModelValue = "unused-model";'
        ],
        []
    );
}

function sideEffectRuntime(
    input: SourceTargetSkewInput,
    paths: SourceTargetSkewPaths
): DeadCodeEliminationGeneratedFile {
    return runtimeFile(
        paths.sideEffectInputPath,
        paths.sideEffectTargetPath,
        [
            eventPush(`${input.eventName}-side`),
            'export const unusedSideEffectValue = "unused-side-effect";'
        ],
        []
    );
}

function runtimeFiles(
    input: SourceTargetSkewInput,
    paths: SourceTargetSkewPaths
): readonly DeadCodeEliminationGeneratedFile[] {
    return [
        entryRuntime(paths),
        featureRuntime(paths),
        modelRuntime(input, paths),
        sideEffectRuntime(input, paths)
    ];
}

function declarationFiles(paths: SourceTargetSkewPaths): readonly DeadCodeEliminationGeneratedFile[] {
    return [
        declarationFile(
            paths.entryDeclarationInputPath,
            paths.entryDeclarationTargetPath,
            [ 'export declare function api(): unknown;' ]
        ),
        declarationFile(
            paths.featureDeclarationInputPath,
            paths.featureDeclarationTargetPath,
            [
                'export declare const featureValue: unknown;',
                'export declare const removedFeatureValue: string;'
            ]
        ),
        declarationFile(
            paths.modelDeclarationInputPath,
            paths.modelDeclarationTargetPath,
            [
                'export declare const modelValue: unknown;',
                'export declare const unusedModelValue: string;'
            ]
        )
    ];
}

function sourceMapFiles(
    input: SourceTargetSkewInput,
    files: readonly DeadCodeEliminationGeneratedFile[]
): readonly DeadCodeEliminationGeneratedFile[] {
    return files.map(function (file) {
        return sourceMapFile(input, file.targetFilePath, file.content);
    });
}

function sourceTargetSkewBundle(input: SourceTargetSkewInput): DeadCodeEliminationGeneratedBundle {
    const paths = targetPathsFor(input);
    const runtime = runtimeFiles(input, paths);
    const declarations = declarationFiles(paths);
    return {
        name: packageName,
        runtimeFiles: runtime,
        declarationFiles: declarations,
        assetFiles: sourceMapFiles(input, [ ...runtime, ...declarations ]),
        rootTargetFilePath: paths.entryTargetPath,
        rootDeclarationTargetFilePath: paths.entryDeclarationTargetPath
    };
}

function referenceHasTargetFilePath(
    reference: ArtifactModuleReference
): reference is Extract<ArtifactModuleReference, { readonly targetFilePath: string; }> {
    return Object.hasOwn(reference, 'targetFilePath');
}

function referenceHasPackageName(
    reference: ArtifactModuleReference
): reference is Extract<ArtifactModuleReference, { readonly packageName: string; }> {
    return Object.hasOwn(reference, 'packageName');
}

function artifactReferenceDescription(reference: ArtifactModuleReference): string {
    if (referenceHasTargetFilePath(reference)) {
        return `${reference.emittedSpecifier} -> ${reference.targetFilePath}`;
    }
    if (referenceHasPackageName(reference)) {
        return `${reference.emittedSpecifier} -> ${reference.packageName}`;
    }
    return 'unknown -> unknown';
}

function resourceReferences(
    bundle: LinkedBundle,
    file: DeadCodeEliminationGeneratedFile
): readonly string[] {
    const resource = bundle.contents.find(function (candidate) {
        return candidate.fileDescription.targetFilePath === file.targetFilePath;
    });
    return resource === undefined
        ? []
        : resource.moduleReferences.map(artifactReferenceDescription);
}

function fileDetails(
    generatedBundle: DeadCodeEliminationGeneratedBundle,
    linkedBundle: LinkedBundle,
    file: DeadCodeEliminationGeneratedFile
): string {
    const dependencies = file.dependencies.length === 0 ? [ 'none' ] : file.dependencies;
    const moduleReferences = resourceReferences(linkedBundle, file);
    const references = moduleReferences.length === 0 ? [ 'none' ] : moduleReferences;
    return [
        `// file: ${generatedBundle.name}/${file.targetFilePath}`,
        `// input: ${file.inputFilePath}`,
        `// dependencies: ${dependencies.join(', ')}`,
        `// module references: ${references.join(', ')}`,
        file.content.trimEnd()
    ]
        .join('\n');
}

function sourceTargetSkewFileListing(
    generatedBundle: DeadCodeEliminationGeneratedBundle,
    linkedBundle: LinkedBundle
): string {
    return [
        ...generatedBundle.runtimeFiles,
        ...generatedBundle.declarationFiles,
        ...generatedBundle.assetFiles
    ]
        .map(function (file) {
            return fileDetails(generatedBundle, linkedBundle, file);
        })
        .join('\n\n');
}

function sourceTargetSkewCaseName(input: SourceTargetSkewInput): string {
    return [
        'source-target-skew',
        input.targetLayout.name,
        input.inputExtension.slice(1),
        input.runtimeExtension.slice(1),
        input.declarationExtension.replaceAll('.', ''),
        input.sourceMapMode
    ]
        .join('-');
}

function sourceTargetSkewProgram(input: SourceTargetSkewInput): GeneratedDeadCodeEliminationProgram {
    const bundle = sourceTargetSkewBundle(input);
    const program = deadCodeEliminationSingleBundleProgramFrom({
        name: sourceTargetSkewCaseName(input),
        bundle,
        entry: {
            bundleName: packageName,
            targetFilePath: bundle.rootTargetFilePath,
            exportName: 'api'
        }
    });
    return {
        ...program,
        fileListing: sourceTargetSkewFileListing(bundle, program.bundle)
    };
}

export function deadCodeEliminationSourceTargetSkewRegression(): GeneratedDeadCodeEliminationProgram {
    return sourceTargetSkewProgram({
        expression: { source: JSON.stringify('skew-regression') },
        eventName: 'regress',
        inputExtension: '.ts',
        runtimeExtension: '.js',
        declarationExtension: '.d.ts',
        sourceMapMode: 'missing-source',
        targetLayout: splitTargetFoldersLayout
    });
}

export const deadCodeEliminationSourceTargetSkewProgramArbitrary: fc.Arbitrary<GeneratedDeadCodeEliminationProgram> = fc
    .record({
        expression: expressionArbitrary,
        eventName: eventNameArbitrary,
        inputExtension: fc.constantFrom(...inputExtensions),
        runtimeExtension: fc.constantFrom(...runtimeTargetExtensions),
        declarationExtension: fc.constantFrom(...declarationTargetExtensions),
        sourceMapMode: fc.constantFrom(...sourceMapModes),
        targetLayout: fc.constantFrom(...targetLayouts)
    })
    .map(sourceTargetSkewProgram);
