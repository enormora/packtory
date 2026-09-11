import fc from 'fast-check';
import {
    deadCodeEliminationDeclarationFor as declarationFor,
    deadCodeEliminationDependencyPath as dependencyPath,
    deadCodeEliminationEventNameArbitrary as eventNameArbitrary,
    deadCodeEliminationEventPush as eventPush,
    deadCodeEliminationExpressionArbitrary as expressionArbitrary,
    deadCodeEliminationRuntimeFile as runtimeFile,
    deadCodeEliminationSingleBundleProgramFrom,
    type DeadCodeEliminationGeneratedFile,
    type GeneratedDeadCodeEliminationProgram,
    type GeneratedExpression
} from './dead-code-elimination-generated-programs.ts';

type ProgramInput = {
    readonly name: string;
    readonly runtimeFiles: readonly DeadCodeEliminationGeneratedFile[];
    readonly declarationFiles: readonly DeadCodeEliminationGeneratedFile[];
};

export const deadCodeEliminationCoreCaseKinds = [
    'aliased-import',
    'named-import',
    'named-reexport',
    'namespace-import',
    'side-effect-import',
    'star-reexport'
] as const;

export type DeadCodeEliminationCoreCaseKind = typeof deadCodeEliminationCoreCaseKinds[number];

type CoreCaseInput = {
    readonly kind: DeadCodeEliminationCoreCaseKind;
    readonly expression: GeneratedExpression;
    readonly eventName: string;
};

type BroadCaseInput = {
    readonly firstExpression: GeneratedExpression;
    readonly secondExpression: GeneratedExpression;
    readonly eventName: string;
};

const packageName = 'pkg';

function moduleA(expression: GeneratedExpression, eventName: string): DeadCodeEliminationGeneratedFile {
    return runtimeFile(
        'module-a.js',
        [
            eventPush(eventName),
            `export const valueA = ${expression.source};`,
            'export function api() { return valueA; }',
            'export const unusedA = "unused-a";'
        ],
        []
    );
}

function moduleADeclaration(): DeadCodeEliminationGeneratedFile {
    return declarationFor(
        'module-a.js',
        [
            'export declare const valueA: unknown;',
            'export declare function api(): unknown;',
            'export declare const unusedA: string;',
            'export type PublicType = string;'
        ],
        []
    );
}

function indexDeclarationForReexport(): DeadCodeEliminationGeneratedFile {
    return declarationFor(
        'index.js',
        [
            'export { api } from "./module-a.js";',
            'export type { PublicType } from "./module-a.js";',
            'export declare const unusedDeclaration: string;'
        ],
        [ dependencyPath('index.d.ts', 'module-a.d.ts') ]
    );
}

function indexDeclarationForLocalApi(): DeadCodeEliminationGeneratedFile {
    return declarationFor(
        'index.js',
        [
            'export declare function api(): unknown;',
            'export declare const unusedDeclaration: string;'
        ],
        []
    );
}

function namedImportCase(input: CoreCaseInput): ProgramInput {
    const dependency = dependencyPath('index.js', 'module-a.js');
    return {
        name: `${input.kind}-${input.eventName}`,
        runtimeFiles: [
            runtimeFile(
                'index.js',
                [
                    'import { api as importedApi } from "./module-a.js";',
                    'export function api() { return importedApi(); }',
                    'const unusedIndex = "unused-index";'
                ],
                [ dependency ]
            ),
            moduleA(input.expression, input.eventName)
        ],
        declarationFiles: [ indexDeclarationForReexport(), moduleADeclaration() ]
    };
}

function aliasedImportCase(input: CoreCaseInput): ProgramInput {
    const dependency = dependencyPath('index.js', 'module-a.js');
    return {
        name: `${input.kind}-${input.eventName}`,
        runtimeFiles: [
            runtimeFile(
                'index.js',
                [
                    'import { valueA as importedValue } from "./module-a.js";',
                    'export function api() { return importedValue; }',
                    'const unusedIndex = "unused-index";'
                ],
                [ dependency ]
            ),
            moduleA(input.expression, input.eventName)
        ],
        declarationFiles: [ indexDeclarationForLocalApi(), moduleADeclaration() ]
    };
}

function namespaceImportCase(input: CoreCaseInput): ProgramInput {
    const dependency = dependencyPath('index.js', 'module-a.js');
    return {
        name: `${input.kind}-${input.eventName}`,
        runtimeFiles: [
            runtimeFile(
                'index.js',
                [
                    'import * as feature from "./module-a.js";',
                    'export function api() { return feature.api(); }',
                    'const unusedIndex = "unused-index";'
                ],
                [ dependency ]
            ),
            moduleA(input.expression, input.eventName)
        ],
        declarationFiles: [ indexDeclarationForLocalApi(), moduleADeclaration() ]
    };
}

function namedReexportCase(input: CoreCaseInput): ProgramInput {
    const dependency = dependencyPath('index.js', 'module-a.js');
    return {
        name: `${input.kind}-${input.eventName}`,
        runtimeFiles: [
            runtimeFile(
                'index.js',
                [ 'export { api } from "./module-a.js";', 'export const unusedIndex = "unused-index";' ],
                [ dependency ]
            ),
            moduleA(input.expression, input.eventName)
        ],
        declarationFiles: [ indexDeclarationForReexport(), moduleADeclaration() ]
    };
}

function starReexportCase(input: CoreCaseInput): ProgramInput {
    const dependency = dependencyPath('index.js', 'module-a.js');
    return {
        name: `${input.kind}-${input.eventName}`,
        runtimeFiles: [
            runtimeFile(
                'index.js',
                [ 'export * from "./module-a.js";', 'export const unusedIndex = "unused-index";' ],
                [ dependency ]
            ),
            moduleA(input.expression, input.eventName)
        ],
        declarationFiles: [ indexDeclarationForReexport(), moduleADeclaration() ]
    };
}

function sideEffectImportCase(input: CoreCaseInput): ProgramInput {
    const dependency = dependencyPath('index.js', 'module-a.js');
    return {
        name: `${input.kind}-${input.eventName}`,
        runtimeFiles: [
            runtimeFile(
                'index.js',
                [
                    'import "./module-a.js";',
                    `const localValue = ${input.expression.source};`,
                    'export function api() { return localValue; }',
                    'const unusedIndex = "unused-index";'
                ],
                [ dependency ]
            ),
            runtimeFile(
                'module-a.js',
                [ eventPush(input.eventName), 'export const unusedA = "unused-a";' ],
                []
            )
        ],
        declarationFiles: [ indexDeclarationForLocalApi(), moduleADeclaration() ]
    };
}

const coreCaseBuilders: Readonly<Record<DeadCodeEliminationCoreCaseKind, (input: CoreCaseInput) => ProgramInput>> = {
    'aliased-import': aliasedImportCase,
    'named-import': namedImportCase,
    'named-reexport': namedReexportCase,
    'namespace-import': namespaceImportCase,
    'side-effect-import': sideEffectImportCase,
    'star-reexport': starReexportCase
};

function coreCase(input: CoreCaseInput): ProgramInput {
    return coreCaseBuilders[input.kind](input);
}

function broadCase(input: BroadCaseInput): ProgramInput {
    return {
        name: `broad-${input.eventName}`,
        runtimeFiles: [
            runtimeFile(
                'index.js',
                [
                    'import { api as importedApi } from "./module-a.js";',
                    'import * as moduleB from "./module-b.js";',
                    'import "./module-c.js";',
                    'export { extraValue as reexportedExtra } from "./module-d.js";',
                    'export * from "./module-e.js";',
                    'export function api() { return { first: importedApi(), second: moduleB.valueB }; }',
                    'const unusedIndex = "unused-index";'
                ],
                [
                    dependencyPath('index.js', 'module-a.js'),
                    dependencyPath('index.js', 'module-b.js'),
                    dependencyPath('index.js', 'module-c.js'),
                    dependencyPath('index.js', 'module-d.js'),
                    dependencyPath('index.js', 'module-e.js')
                ]
            ),
            runtimeFile(
                'module-a.js',
                [
                    'import { extraValue as importedExtra } from "./module-d.js";',
                    `const valueA = ${input.firstExpression.source};`,
                    'export function api() { return [valueA, importedExtra]; }',
                    'export const unusedA = "unused-a";'
                ],
                [ dependencyPath('module-a.js', 'module-d.js') ]
            ),
            runtimeFile(
                'module-b.js',
                [ `export const valueB = ${input.secondExpression.source};`, 'export const unusedB = "unused-b";' ],
                []
            ),
            runtimeFile(
                'module-c.js',
                [ eventPush(input.eventName), 'export const unusedC = "unused-c";' ],
                []
            ),
            runtimeFile(
                'module-d.js',
                [ 'export const extraValue = "extra";', 'export const unusedD = "unused-d";' ],
                []
            ),
            runtimeFile(
                'module-e.js',
                [ 'export const starValue = "star";', 'export const unusedE = "unused-e";' ],
                []
            )
        ],
        declarationFiles: [
            indexDeclarationForLocalApi(),
            moduleADeclaration(),
            declarationFor(
                'module-b.js',
                [ 'export declare const valueB: unknown;', 'export declare const unusedB: string;' ],
                []
            )
        ]
    };
}

function programFrom(input: ProgramInput): GeneratedDeadCodeEliminationProgram {
    return deadCodeEliminationSingleBundleProgramFrom({
        name: input.name,
        bundle: {
            name: packageName,
            runtimeFiles: input.runtimeFiles,
            declarationFiles: input.declarationFiles,
            assetFiles: [],
            rootTargetFilePath: 'index.js',
            rootDeclarationTargetFilePath: 'index.d.ts'
        },
        entry: {
            bundleName: packageName,
            targetFilePath: 'index.js',
            exportName: 'api'
        }
    });
}

export function deadCodeEliminationCoreProgramArbitraryFor(
    kind: DeadCodeEliminationCoreCaseKind
): fc.Arbitrary<GeneratedDeadCodeEliminationProgram> {
    return fc
        .record({
            kind: fc.constant(kind),
            expression: expressionArbitrary,
            eventName: eventNameArbitrary
        })
        .map(coreCase)
        .map(programFrom);
}

export const deadCodeEliminationBroadProgramArbitrary: fc.Arbitrary<GeneratedDeadCodeEliminationProgram> = fc
    .record({
        firstExpression: expressionArbitrary,
        secondExpression: expressionArbitrary,
        eventName: eventNameArbitrary
    })
    .map(broadCase)
    .map(programFrom);
