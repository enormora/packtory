import path from 'node:path';
import fc from 'fast-check';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import { bundleResource, linkedBundle } from './bundle-fixtures.ts';
import type { DeadCodeEliminationOracleEntry } from './dead-code-elimination-oracle-test-support.ts';

export type GeneratedExpression = {
    readonly source: string;
};

export type DeadCodeEliminationGeneratedFile = {
    readonly inputFilePath: string;
    readonly targetFilePath: string;
    readonly content: string;
    readonly dependencies: readonly string[];
};

export type DeadCodeEliminationGeneratedBundle = {
    readonly name: string;
    readonly runtimeFiles: readonly DeadCodeEliminationGeneratedFile[];
    readonly declarationFiles: readonly DeadCodeEliminationGeneratedFile[];
    readonly rootTargetFilePath: string;
    readonly rootDeclarationTargetFilePath: string;
};

export type GeneratedDeadCodeEliminationProgram = {
    readonly name: string;
    readonly bundle: LinkedBundle;
    readonly entry: DeadCodeEliminationOracleEntry;
    readonly fileListing: string;
};

export type GeneratedDeadCodeEliminationProgramSet = {
    readonly name: string;
    readonly bundles: readonly LinkedBundle[];
    readonly entry: DeadCodeEliminationOracleEntry;
    readonly fileListing: string;
};

type DeadCodeEliminationProgramSetInput = {
    readonly name: string;
    readonly bundles: readonly DeadCodeEliminationGeneratedBundle[];
    readonly entry: DeadCodeEliminationOracleEntry;
};

type DeadCodeEliminationSingleBundleProgramInput = {
    readonly name: string;
    readonly bundle: DeadCodeEliminationGeneratedBundle;
    readonly entry: DeadCodeEliminationOracleEntry;
};

const deadCodeEliminationEventLog = 'globalThis.__packtoryDeadCodeEliminationEvents';

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

const deadCodeEliminationSimpleExpressionArbitrary: fc.Arbitrary<GeneratedExpression> = fc.oneof(
    fc.string({ maxLength: 12 }).map(stringExpression),
    fc.integer({ min: -100, max: 100 }).map(numberExpression),
    fc.boolean().map(booleanExpression)
);

export const deadCodeEliminationExpressionArbitrary: fc.Arbitrary<GeneratedExpression> = fc.oneof(
    deadCodeEliminationSimpleExpressionArbitrary,
    fc
        .tuple(deadCodeEliminationSimpleExpressionArbitrary, deadCodeEliminationSimpleExpressionArbitrary)
        .map(arrayExpression),
    fc
        .tuple(deadCodeEliminationSimpleExpressionArbitrary, deadCodeEliminationSimpleExpressionArbitrary)
        .map(objectExpression)
);

export const deadCodeEliminationEventNameArbitrary = fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/);

function deadCodeEliminationSourcePathFor(targetFilePath: string): string {
    return `/src/${targetFilePath}`;
}

function deadCodeEliminationModuleSpecifier(
    fromTargetFilePath: string,
    toTargetFilePath: string
): string {
    const relativePath = path.posix.relative(path.posix.dirname(fromTargetFilePath), toTargetFilePath);
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

export function deadCodeEliminationDependencyPath(
    fromTargetFilePath: string,
    toTargetFilePath: string
): string {
    const targetPath = path.posix.join(
        path.posix.dirname(fromTargetFilePath),
        deadCodeEliminationModuleSpecifier(fromTargetFilePath, toTargetFilePath)
    );
    return deadCodeEliminationSourcePathFor(path.posix.normalize(targetPath));
}

function deadCodeEliminationFileFromSource(
    inputFilePath: string,
    targetFilePath: string,
    lines: readonly string[],
    dependencies: readonly string[]
): DeadCodeEliminationGeneratedFile {
    return {
        inputFilePath,
        targetFilePath,
        content: `${lines.join('\n')}\n`,
        dependencies
    };
}

export function deadCodeEliminationRuntimeFile(
    targetFilePath: string,
    lines: readonly string[],
    dependencies: readonly string[]
): DeadCodeEliminationGeneratedFile {
    return deadCodeEliminationFileFromSource(
        deadCodeEliminationSourcePathFor(targetFilePath),
        targetFilePath,
        lines,
        dependencies
    );
}

export const deadCodeEliminationRuntimeFileFromSource = deadCodeEliminationFileFromSource;
export const deadCodeEliminationDeclarationFileFromSource = deadCodeEliminationFileFromSource;

export function deadCodeEliminationDeclarationFor(
    targetFilePath: string,
    lines: readonly string[],
    dependencies: readonly string[]
): DeadCodeEliminationGeneratedFile {
    return deadCodeEliminationRuntimeFile(targetFilePath.replace(/\.js$/u, '.d.ts'), lines, dependencies);
}

export function deadCodeEliminationEventPush(eventName: string): string {
    return `${deadCodeEliminationEventLog}.push(String(${JSON.stringify(eventName)}));`;
}

function generatedFileToResource(file: DeadCodeEliminationGeneratedFile): LinkedBundleResource {
    return {
        ...bundleResource(file.inputFilePath, {
            content: file.content,
            directDependencies: new Set(file.dependencies),
            targetFilePath: file.targetFilePath
        }),
        isSubstituted: false
    };
}

function generatedFileWithTarget(
    bundle: DeadCodeEliminationGeneratedBundle,
    targetFilePath: string
): DeadCodeEliminationGeneratedFile {
    const match = [ ...bundle.runtimeFiles, ...bundle.declarationFiles ].find(function (file) {
        return file.targetFilePath === targetFilePath;
    });
    if (match === undefined) {
        throw new Error(`Generated bundle ${bundle.name} is missing ${targetFilePath}`);
    }
    return match;
}

function deadCodeEliminationLinkedBundleFrom(
    input: DeadCodeEliminationGeneratedBundle
): LinkedBundle {
    const rootRuntime = generatedFileWithTarget(input, input.rootTargetFilePath);
    const rootDeclaration = generatedFileWithTarget(input, input.rootDeclarationTargetFilePath);
    return linkedBundle({
        name: input.name,
        contents: [ ...input.runtimeFiles, ...input.declarationFiles ].map(generatedFileToResource),
        roots: {
            main: {
                js: {
                    content: rootRuntime.content,
                    isExecutable: false,
                    inputFilePath: rootRuntime.inputFilePath,
                    targetFilePath: rootRuntime.targetFilePath
                },
                declarationFile: {
                    content: rootDeclaration.content,
                    isExecutable: false,
                    inputFilePath: rootDeclaration.inputFilePath,
                    targetFilePath: rootDeclaration.targetFilePath
                }
            }
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });
}

function displayedTargetPath(bundleName: string, targetFilePath: string): string {
    return targetFilePath.startsWith(`${bundleName}/`) ? targetFilePath : `${bundleName}/${targetFilePath}`;
}

function formatFile(bundleName: string, file: DeadCodeEliminationGeneratedFile): string {
    return [
        `// file: ${displayedTargetPath(bundleName, file.targetFilePath)}`,
        file.content.trimEnd()
    ]
        .join('\n');
}

function fileListingFor(bundle: DeadCodeEliminationGeneratedBundle): string {
    return [ ...bundle.runtimeFiles, ...bundle.declarationFiles ]
        .map(function (file) {
            return formatFile(bundle.name, file);
        })
        .join('\n\n');
}

function deadCodeEliminationFileListingFor(
    bundles: readonly DeadCodeEliminationGeneratedBundle[]
): string {
    return bundles.map(fileListingFor).join('\n\n');
}

export function deadCodeEliminationProgramSetFrom(
    input: DeadCodeEliminationProgramSetInput
): GeneratedDeadCodeEliminationProgramSet {
    return {
        name: input.name,
        bundles: input.bundles.map(deadCodeEliminationLinkedBundleFrom),
        entry: input.entry,
        fileListing: deadCodeEliminationFileListingFor(input.bundles)
    };
}

export function deadCodeEliminationSingleBundleProgramFrom(
    input: DeadCodeEliminationSingleBundleProgramInput
): GeneratedDeadCodeEliminationProgram {
    return {
        name: input.name,
        bundle: deadCodeEliminationLinkedBundleFrom(input.bundle),
        entry: input.entry,
        fileListing: deadCodeEliminationFileListingFor([ input.bundle ])
    };
}
