import path from 'node:path';
import fc from 'fast-check';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import { bundleResource, linkedBundle } from './bundle-fixtures.ts';
import type { DeadCodeEliminationOracleEntry } from './dead-code-elimination-oracle-test-support.ts';

export type GeneratedDeadCodeEliminationProgram = {
    readonly name: string;
    readonly bundle: LinkedBundle;
    readonly entry: DeadCodeEliminationOracleEntry;
    readonly fileListing: string;
};

type GeneratedExpression = {
    readonly source: string;
};

type RuntimeFile = {
    readonly targetFilePath: string;
    readonly content: string;
    readonly dependencies: readonly string[];
};

type ProgramInput = {
    readonly name: string;
    readonly runtimeFiles: readonly RuntimeFile[];
    readonly declarationFiles: readonly RuntimeFile[];
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
const eventLog = 'globalThis.__packtoryDeadCodeEliminationEvents';

function stringExpression(value: string): GeneratedExpression {
    return { source: JSON.stringify(value) };
}

function numberExpression(value: number): GeneratedExpression {
    return { source: String(value) };
}

function booleanExpression(value: boolean): GeneratedExpression {
    return { source: String(value) };
}

function arrayExpression(values: readonly [GeneratedExpression, GeneratedExpression]): GeneratedExpression {
    return { source: `[${values[0].source}, ${values[1].source}]` };
}

function objectExpression(values: readonly [GeneratedExpression, GeneratedExpression]): GeneratedExpression {
    return { source: `({ alpha: ${values[0].source}, beta: ${values[1].source} })` };
}

const simpleExpressionArbitrary: fc.Arbitrary<GeneratedExpression> = fc.oneof(
    fc.string({ maxLength: 12 }).map(stringExpression),
    fc.integer({ min: -100, max: 100 }).map(numberExpression),
    fc.boolean().map(booleanExpression)
);

const expressionArbitrary: fc.Arbitrary<GeneratedExpression> = fc.oneof(
    simpleExpressionArbitrary,
    fc.tuple(simpleExpressionArbitrary, simpleExpressionArbitrary).map(arrayExpression),
    fc.tuple(simpleExpressionArbitrary, simpleExpressionArbitrary).map(objectExpression)
);

const eventNameArbitrary = fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/);

function sourcePathFor(targetFilePath: string): string {
    return `/src/${targetFilePath}`;
}

function moduleSpecifier(fromTargetFilePath: string, toTargetFilePath: string): string {
    const relativePath = path.posix.relative(path.posix.dirname(fromTargetFilePath), toTargetFilePath);
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

function dependencyPath(fromTargetFilePath: string, toTargetFilePath: string): string {
    const targetPath = path.posix.join(
        path.posix.dirname(fromTargetFilePath),
        moduleSpecifier(fromTargetFilePath, toTargetFilePath)
    );
    return sourcePathFor(path.posix.normalize(targetPath));
}

function runtimeFile(
    targetFilePath: string,
    lines: readonly string[],
    dependencies: readonly string[]
): RuntimeFile {
    return {
        targetFilePath,
        content: `${lines.join('\n')}\n`,
        dependencies
    };
}

function declarationFor(
    targetFilePath: string,
    lines: readonly string[],
    dependencies: readonly string[]
): RuntimeFile {
    return runtimeFile(targetFilePath.replace(/\.js$/u, '.d.ts'), lines, dependencies);
}

function eventPush(eventName: string): string {
    return `${eventLog}.push(String(${JSON.stringify(eventName)}));`;
}

function moduleA(expression: GeneratedExpression, eventName: string): RuntimeFile {
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

function moduleADeclaration(): RuntimeFile {
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

function indexDeclarationForReexport(): RuntimeFile {
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

function indexDeclarationForLocalApi(): RuntimeFile {
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

function fileToResource(file: RuntimeFile): LinkedBundleResource {
    return {
        ...bundleResource(sourcePathFor(file.targetFilePath), {
            content: file.content,
            directDependencies: new Set(file.dependencies),
            targetFilePath: file.targetFilePath
        }),
        isSubstituted: false
    };
}

function formatFile(file: RuntimeFile): string {
    return [ `// file: ${packageName}/${file.targetFilePath}`, file.content.trimEnd() ].join('\n');
}

function fileListingFor(input: ProgramInput): string {
    return [ ...input.runtimeFiles, ...input.declarationFiles ].map(formatFile).join('\n\n');
}

function programFrom(input: ProgramInput): GeneratedDeadCodeEliminationProgram {
    const resources = [ ...input.runtimeFiles, ...input.declarationFiles ].map(fileToResource);
    const index = input.runtimeFiles[0];
    if (index === undefined) {
        throw new Error('Generated program is missing index.js');
    }
    const indexDeclaration = input.declarationFiles[0];
    if (indexDeclaration === undefined) {
        throw new Error('Generated program is missing index.d.ts');
    }

    return {
        name: input.name,
        bundle: linkedBundle({
            name: packageName,
            contents: resources,
            roots: {
                main: {
                    js: {
                        content: index.content,
                        isExecutable: false,
                        sourceFilePath: sourcePathFor(index.targetFilePath),
                        targetFilePath: index.targetFilePath
                    },
                    declarationFile: {
                        content: indexDeclaration.content,
                        isExecutable: false,
                        sourceFilePath: sourcePathFor(indexDeclaration.targetFilePath),
                        targetFilePath: indexDeclaration.targetFilePath
                    }
                }
            },
            surface: { mode: 'implicit', defaultModuleRoot: 'main' }
        }),
        entry: {
            bundleName: packageName,
            targetFilePath: 'index.js',
            exportName: 'api'
        },
        fileListing: fileListingFor(input)
    };
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
