import fc from 'fast-check';
import {
    deadCodeEliminationDeclarationFor as declarationFor,
    deadCodeEliminationDependencyPath as dependencyPath,
    deadCodeEliminationEventNameArbitrary as eventNameArbitrary,
    deadCodeEliminationEventPush as eventPush,
    deadCodeEliminationExpressionArbitrary as expressionArbitrary,
    deadCodeEliminationProgramSetFrom,
    deadCodeEliminationRuntimeFile as runtimeFile,
    type DeadCodeEliminationGeneratedBundle,
    type DeadCodeEliminationGeneratedFile,
    type GeneratedDeadCodeEliminationProgramSet,
    type GeneratedExpression
} from './dead-code-elimination-generated-programs.ts';
import { declarationCompanionChainCase } from './dead-code-elimination-companion-metamorphic-programs.ts';
import type {
    DeadCodeEliminationMetamorphicInput,
    DeadCodeEliminationMetamorphicTransformKind,
    GeneratedDeadCodeEliminationMetamorphicCase
} from './dead-code-elimination-metamorphic-types.ts';

const packageName = 'pkg';

type AdditionalGeneratedFiles = {
    readonly runtimeFiles: readonly DeadCodeEliminationGeneratedFile[];
    readonly declarationFiles: readonly DeadCodeEliminationGeneratedFile[];
};

function indexDeclaration(): DeadCodeEliminationGeneratedFile {
    return declarationFor(
        'index.js',
        [
            'export declare function api(): unknown;',
            'export declare const unusedDeclaration: string;'
        ],
        []
    );
}

function moduleADeclaration(): DeadCodeEliminationGeneratedFile {
    return declarationFor(
        'module-a.js',
        [
            'export declare const valueA: unknown;',
            'export declare const unusedA: string;',
            'export declare function unusedFunction(): string;'
        ],
        []
    );
}

function baseIndexFile(
    importLine: string,
    returnExpression: string,
    dependencies: readonly string[]
): DeadCodeEliminationGeneratedFile {
    return runtimeFile(
        'index.js',
        [
            importLine,
            `export function api() { return ${returnExpression}; }`,
            'const unusedIndex = "unused-index";'
        ],
        dependencies
    );
}

function moduleAWithDirectExport(
    expression: GeneratedExpression,
    eventName: string
): DeadCodeEliminationGeneratedFile {
    return runtimeFile(
        'module-a.js',
        [
            eventPush(eventName),
            `export const valueA = ${expression.source};`,
            'export const unusedA = "unused-a";',
            'function unusedFunction() { return "unused"; }'
        ],
        []
    );
}

function singleBundle(
    runtimeFiles: readonly DeadCodeEliminationGeneratedFile[],
    declarationFiles: readonly DeadCodeEliminationGeneratedFile[]
): DeadCodeEliminationGeneratedBundle {
    return {
        name: packageName,
        runtimeFiles,
        declarationFiles,
        assetFiles: [],
        rootTargetFilePath: 'index.js',
        rootDeclarationTargetFilePath: 'index.d.ts'
    };
}

function singleProgramSet(
    name: string,
    runtimeFiles: readonly DeadCodeEliminationGeneratedFile[],
    declarationFiles: readonly DeadCodeEliminationGeneratedFile[]
): GeneratedDeadCodeEliminationProgramSet {
    return deadCodeEliminationProgramSetFrom({
        name,
        bundles: [ singleBundle(runtimeFiles, declarationFiles) ],
        entry: {
            bundleName: packageName,
            targetFilePath: 'index.js',
            exportName: 'api'
        }
    });
}

function singleBaseProgram(
    name: string,
    index: DeadCodeEliminationGeneratedFile,
    moduleA: DeadCodeEliminationGeneratedFile,
    additionalFiles: AdditionalGeneratedFiles
): GeneratedDeadCodeEliminationProgramSet {
    return singleProgramSet(
        name,
        [ index, moduleA, ...additionalFiles.runtimeFiles ],
        [ indexDeclaration(), moduleADeclaration(), ...additionalFiles.declarationFiles ]
    );
}

function metamorphicCase(
    input: DeadCodeEliminationMetamorphicInput,
    original: GeneratedDeadCodeEliminationProgramSet,
    transformed: GeneratedDeadCodeEliminationProgramSet
): GeneratedDeadCodeEliminationMetamorphicCase {
    return {
        name: `${input.kind}-${input.eventName}`,
        transformKind: input.kind,
        original,
        transformed
    };
}

function namedImportIndex(): DeadCodeEliminationGeneratedFile {
    return baseIndexFile(
        'import { valueA } from "./module-a.js";',
        'valueA',
        [ dependencyPath('index.js', 'module-a.js') ]
    );
}

function emptyAdditionalFiles(): AdditionalGeneratedFiles {
    return {
        runtimeFiles: [],
        declarationFiles: []
    };
}

function caseName(input: DeadCodeEliminationMetamorphicInput, state: 'original' | 'transformed'): string {
    return `${input.kind}-${input.eventName}-${state}`;
}

function directModuleProgram(
    input: DeadCodeEliminationMetamorphicInput,
    state: 'original' | 'transformed'
): GeneratedDeadCodeEliminationProgramSet {
    return singleBaseProgram(
        caseName(input, state),
        namedImportIndex(),
        moduleAWithDirectExport(input.expression, input.eventName),
        emptyAdditionalFiles()
    );
}

function directModuleTransformedProgram(
    input: DeadCodeEliminationMetamorphicInput,
    moduleA: DeadCodeEliminationGeneratedFile
): GeneratedDeadCodeEliminationProgramSet {
    return singleBaseProgram(
        caseName(input, 'transformed'),
        namedImportIndex(),
        moduleA,
        emptyAdditionalFiles()
    );
}

function importAliasingCase(input: DeadCodeEliminationMetamorphicInput): GeneratedDeadCodeEliminationMetamorphicCase {
    const original = directModuleProgram(input, 'original');
    const transformed = singleBaseProgram(
        caseName(input, 'transformed'),
        baseIndexFile(
            'import { valueA as importedValueA } from "./module-a.js";',
            'importedValueA',
            [ dependencyPath('index.js', 'module-a.js') ]
        ),
        moduleAWithDirectExport(input.expression, input.eventName),
        emptyAdditionalFiles()
    );
    return metamorphicCase(input, original, transformed);
}

function localBindingRenameCase(
    input: DeadCodeEliminationMetamorphicInput
): GeneratedDeadCodeEliminationMetamorphicCase {
    const original = directModuleProgram(input, 'original');
    const transformedModuleA = runtimeFile(
        'module-a.js',
        [
            eventPush(input.eventName),
            `const internalValueA = ${input.expression.source};`,
            'export { internalValueA as valueA };',
            'export const unusedA = "unused-a";'
        ],
        []
    );
    const transformed = directModuleTransformedProgram(input, transformedModuleA);
    return metamorphicCase(input, original, transformed);
}

function directExportConversionCase(
    input: DeadCodeEliminationMetamorphicInput
): GeneratedDeadCodeEliminationMetamorphicCase {
    const original = directModuleProgram(input, 'original');
    const transformedModuleA = runtimeFile(
        'module-a.js',
        [
            eventPush(input.eventName),
            `const valueA = ${input.expression.source};`,
            'export { valueA };',
            'export const unusedA = "unused-a";'
        ],
        []
    );
    const transformed = directModuleTransformedProgram(input, transformedModuleA);
    return metamorphicCase(input, original, transformed);
}

function unusedRuntimeSurfaceCase(
    input: DeadCodeEliminationMetamorphicInput
): GeneratedDeadCodeEliminationMetamorphicCase {
    const original = directModuleProgram(input, 'original');
    const transformedModuleA = runtimeFile(
        'module-a.js',
        [
            eventPush(input.eventName),
            `export const valueA = ${input.expression.source};`,
            `export const unusedExtra = ${input.secondExpression.source};`,
            'export function unusedFunction() { return "unused"; }'
        ],
        []
    );
    const transformed = directModuleTransformedProgram(input, transformedModuleA);
    return metamorphicCase(input, original, transformed);
}

function unusedModulesCase(input: DeadCodeEliminationMetamorphicInput): GeneratedDeadCodeEliminationMetamorphicCase {
    const original = directModuleProgram(input, 'original');
    const transformed = singleBaseProgram(
        caseName(input, 'transformed'),
        namedImportIndex(),
        moduleAWithDirectExport(input.expression, input.eventName),
        {
            runtimeFiles: [
                runtimeFile(
                    'unused-module.js',
                    [
                        `const hiddenValue = ${input.secondExpression.source};`,
                        'export const unusedValue = hiddenValue;'
                    ],
                    []
                )
            ],
            declarationFiles: [
                declarationFor(
                    'unused-module.js',
                    [ 'export declare const unusedValue: unknown;' ],
                    []
                )
            ]
        }
    );
    return metamorphicCase(input, original, transformed);
}

function topLevelUnusedReorderCase(
    input: DeadCodeEliminationMetamorphicInput
): GeneratedDeadCodeEliminationMetamorphicCase {
    const originalModuleA = runtimeFile(
        'module-a.js',
        [
            eventPush(input.eventName),
            `export const valueA = ${input.expression.source};`,
            'const unusedFirst = "first";',
            `const unusedSecond = ${input.secondExpression.source};`,
            'export const unusedA = unusedFirst;'
        ],
        []
    );
    const transformedModuleA = runtimeFile(
        'module-a.js',
        [
            eventPush(input.eventName),
            `export const valueA = ${input.expression.source};`,
            `const unusedSecond = ${input.secondExpression.source};`,
            'const unusedFirst = "first";',
            'export const unusedA = unusedFirst;'
        ],
        []
    );
    const original = singleBaseProgram(
        caseName(input, 'original'),
        namedImportIndex(),
        originalModuleA,
        emptyAdditionalFiles()
    );
    const transformed = singleBaseProgram(
        caseName(input, 'transformed'),
        namedImportIndex(),
        transformedModuleA,
        emptyAdditionalFiles()
    );
    return metamorphicCase(input, original, transformed);
}

function intermediateReexportCase(
    input: DeadCodeEliminationMetamorphicInput
): GeneratedDeadCodeEliminationMetamorphicCase {
    const original = directModuleProgram(input, 'original');
    const bridge = runtimeFile(
        'bridge.js',
        [
            'export { valueA } from "./module-a.js";',
            'export const unusedBridge = "unused-bridge";'
        ],
        [ dependencyPath('bridge.js', 'module-a.js') ]
    );
    const transformed = singleBaseProgram(
        caseName(input, 'transformed'),
        baseIndexFile(
            'import { valueA } from "./bridge.js";',
            'valueA',
            [ dependencyPath('index.js', 'bridge.js') ]
        ),
        moduleAWithDirectExport(input.expression, input.eventName),
        {
            runtimeFiles: [ bridge ],
            declarationFiles: [
                declarationFor(
                    'bridge.js',
                    [
                        'export { valueA } from "./module-a.js";',
                        'export declare const unusedBridge: string;'
                    ],
                    [ dependencyPath('bridge.d.ts', 'module-a.d.ts') ]
                )
            ]
        }
    );
    return metamorphicCase(input, original, transformed);
}

function pureSideEffectImportCase(
    input: DeadCodeEliminationMetamorphicInput
): GeneratedDeadCodeEliminationMetamorphicCase {
    const original = directModuleProgram(input, 'original');
    const transformedIndex = runtimeFile(
        'index.js',
        [
            'import "./unused-side-effect.js";',
            'import { valueA } from "./module-a.js";',
            'export function api() { return valueA; }',
            'const unusedIndex = "unused-index";'
        ],
        [
            dependencyPath('index.js', 'unused-side-effect.js'),
            dependencyPath('index.js', 'module-a.js')
        ]
    );
    const transformed = singleBaseProgram(
        caseName(input, 'transformed'),
        transformedIndex,
        moduleAWithDirectExport(input.expression, input.eventName),
        {
            runtimeFiles: [
                runtimeFile(
                    'unused-side-effect.js',
                    [ 'const unusedSideEffectImportTarget = "pure";' ],
                    []
                )
            ],
            declarationFiles: []
        }
    );
    return metamorphicCase(input, original, transformed);
}

function eliminateTwiceCase(input: DeadCodeEliminationMetamorphicInput): GeneratedDeadCodeEliminationMetamorphicCase {
    const original = directModuleProgram(input, 'original');
    return metamorphicCase(input, original, original);
}

const caseBuilders: Readonly<
    Record<
        DeadCodeEliminationMetamorphicTransformKind,
        (input: DeadCodeEliminationMetamorphicInput) => GeneratedDeadCodeEliminationMetamorphicCase
    >
> = {
    'declaration-companion-chain': declarationCompanionChainCase,
    'direct-export-conversion': directExportConversionCase,
    'eliminate-twice': eliminateTwiceCase,
    'import-aliasing': importAliasingCase,
    'intermediate-reexport': intermediateReexportCase,
    'local-binding-rename': localBindingRenameCase,
    'pure-side-effect-import': pureSideEffectImportCase,
    'top-level-unused-reorder': topLevelUnusedReorderCase,
    'unused-modules': unusedModulesCase,
    'unused-runtime-surface': unusedRuntimeSurfaceCase
};

export function generatedDeclarationCompanionMetamorphicRegression(): GeneratedDeadCodeEliminationMetamorphicCase {
    return declarationCompanionChainCase({
        kind: 'declaration-companion-chain',
        expression: { source: JSON.stringify('error') },
        secondExpression: { source: JSON.stringify('unused') },
        eventName: 'regress'
    });
}

export function deadCodeEliminationMetamorphicProgramArbitraryFor(
    kind: DeadCodeEliminationMetamorphicTransformKind
): fc.Arbitrary<GeneratedDeadCodeEliminationMetamorphicCase> {
    return fc
        .record({
            kind: fc.constant(kind),
            expression: expressionArbitrary,
            secondExpression: expressionArbitrary,
            eventName: eventNameArbitrary
        })
        .map(function (input) {
            return caseBuilders[kind](input);
        });
}
