import {
    deadCodeEliminationDeclarationFileFromSource as declarationFileFromSource,
    deadCodeEliminationDeclarationFor as declarationFor,
    deadCodeEliminationProgramSetFrom,
    deadCodeEliminationRuntimeFileFromSource as runtimeFileFromSource,
    type DeadCodeEliminationGeneratedBundle,
    type DeadCodeEliminationGeneratedFile,
    type GeneratedDeadCodeEliminationProgramSet,
    type GeneratedExpression
} from './dead-code-elimination-generated-programs.ts';
import type {
    DeadCodeEliminationMetamorphicInput,
    GeneratedDeadCodeEliminationMetamorphicCase
} from './dead-code-elimination-metamorphic-types.ts';

const producerPackageName = 'package-producer';
const consumerPackageName = 'package-consumer';
const producerIndexTargetPath = 'package-producer/index.js';
const producerBaseSharedTargetPath = 'package-producer/base-shared.js';
const producerBaseSharedDeclarationTargetPath = 'package-producer/base-shared.d.ts';
const producerSharedTargetPath = 'package-producer/shared.js';
const producerSharedDeclarationTargetPath = 'package-producer/shared.d.ts';
const producerPluginTargetPath = 'package-producer/plugin.js';
const consumerIndexTargetPath = 'package-consumer/index.js';
const producerIndexSourcePath = '/source/package-producer/index.js';
const producerBaseSharedSourcePath = '/source/package-producer/base-shared.js';
const producerBaseSharedDeclarationSourcePath = '/source/package-producer/base-shared.d.ts';
const producerSharedSourcePath = '/source/package-producer/shared.js';
const producerSharedDeclarationSourcePath = '/source/package-producer/shared.d.ts';
const producerPluginSourcePath = '/source/package-producer/plugin.js';
const consumerIndexSourcePath = '/source/package-consumer/index.js';

function producerIndex(): DeadCodeEliminationGeneratedFile {
    return runtimeFileFromSource(
        producerIndexSourcePath,
        producerIndexTargetPath,
        [
            'import { baseSharedConfig } from "./base-shared.js";',
            'const baseRuleConfig = {',
            '    plugins: {',
            '        ...baseSharedConfig.plugins',
            '    },',
            '    rules: {',
            '        ...baseSharedConfig.rules',
            '    }',
            '};',
            'export const producerConfig = [ baseRuleConfig ];',
            'export function api() { return producerConfig[0].rules["example/basic-rule"]; }'
        ],
        [ producerBaseSharedSourcePath ]
    );
}

function rootApplicationProgrammingInterfaceDeclaration(): DeadCodeEliminationGeneratedFile {
    return declarationFor(
        producerIndexTargetPath,
        [ 'export declare function api(): unknown;' ],
        []
    );
}

function baseSharedRuntime(): DeadCodeEliminationGeneratedFile {
    return runtimeFileFromSource(
        producerBaseSharedSourcePath,
        producerBaseSharedTargetPath,
        [
            'import { sharedConfig } from "./shared.js";',
            'export const baseSharedConfig = {',
            '    plugins: {',
            '        ...sharedConfig.plugins',
            '    },',
            '    rules: {',
            '        ...sharedConfig.rules',
            '    }',
            '};'
        ],
        [ producerSharedSourcePath ]
    );
}

function baseSharedDeclaration(): DeadCodeEliminationGeneratedFile {
    return declarationFileFromSource(
        producerBaseSharedDeclarationSourcePath,
        producerBaseSharedDeclarationTargetPath,
        [
            'export declare const baseSharedConfig: {',
            '    readonly rules: {',
            '        readonly "example/basic-rule": unknown;',
            '    };',
            '};'
        ],
        []
    );
}

function sharedRuntime(expression: GeneratedExpression): DeadCodeEliminationGeneratedFile {
    return runtimeFileFromSource(
        producerSharedSourcePath,
        producerSharedTargetPath,
        [
            'import { plugin } from "./plugin.js";',
            'const unusedConfig = { rules: { unused: "off" } };',
            'export const sharedConfig = {',
            '    plugins: {',
            '        example: plugin',
            '    },',
            '    rules: {',
            `        "example/basic-rule": ${expression.source}`,
            '    }',
            '};'
        ],
        [ producerPluginSourcePath ]
    );
}

function sharedDeclaration(): DeadCodeEliminationGeneratedFile {
    return declarationFileFromSource(
        producerSharedDeclarationSourcePath,
        producerSharedDeclarationTargetPath,
        [
            'export declare const sharedConfig: {',
            '    readonly rules: {',
            '        readonly "example/basic-rule": unknown;',
            '    };',
            '};'
        ],
        []
    );
}

function pluginRuntime(): DeadCodeEliminationGeneratedFile {
    return runtimeFileFromSource(
        producerPluginSourcePath,
        producerPluginTargetPath,
        [
            'export const plugin = {',
            '    rules: {',
            '        "basic-rule": {}',
            '    }',
            '};'
        ],
        []
    );
}

function consumerIndex(): DeadCodeEliminationGeneratedFile {
    return runtimeFileFromSource(
        consumerIndexSourcePath,
        consumerIndexTargetPath,
        [
            'import { baseSharedConfig } from "package-producer/package-producer/base-shared.js";',
            'export function api() { return baseSharedConfig.rules["example/basic-rule"]; }'
        ],
        []
    );
}

function companionProducerBundle(
    expression: GeneratedExpression,
    includeCompanions: boolean
): DeadCodeEliminationGeneratedBundle {
    return {
        name: producerPackageName,
        runtimeFiles: [ producerIndex(), baseSharedRuntime(), sharedRuntime(expression), pluginRuntime() ],
        declarationFiles: includeCompanions
            ? [ rootApplicationProgrammingInterfaceDeclaration(), baseSharedDeclaration(), sharedDeclaration() ]
            : [ rootApplicationProgrammingInterfaceDeclaration() ],
        assetFiles: [],
        rootTargetFilePath: producerIndexTargetPath,
        rootDeclarationTargetFilePath: 'package-producer/index.d.ts'
    };
}

function companionConsumerBundle(): DeadCodeEliminationGeneratedBundle {
    return {
        name: consumerPackageName,
        runtimeFiles: [ consumerIndex() ],
        declarationFiles: [
            declarationFor(
                consumerIndexTargetPath,
                [ 'export declare function api(): unknown;' ],
                []
            )
        ],
        assetFiles: [],
        rootTargetFilePath: consumerIndexTargetPath,
        rootDeclarationTargetFilePath: 'package-consumer/index.d.ts'
    };
}

function companionProgramSet(
    name: string,
    expression: GeneratedExpression,
    includeCompanions: boolean
): GeneratedDeadCodeEliminationProgramSet {
    return deadCodeEliminationProgramSetFrom({
        name,
        bundles: [
            companionConsumerBundle(),
            companionProducerBundle(expression, includeCompanions)
        ],
        entry: {
            bundleName: consumerPackageName,
            targetFilePath: consumerIndexTargetPath,
            exportName: 'api'
        }
    });
}

export function declarationCompanionChainCase(
    input: DeadCodeEliminationMetamorphicInput
): GeneratedDeadCodeEliminationMetamorphicCase {
    const original = companionProgramSet(`${input.kind}-${input.eventName}-original`, input.expression, false);
    const transformed = companionProgramSet(`${input.kind}-${input.eventName}-transformed`, input.expression, true);
    return {
        name: `${input.kind}-${input.eventName}`,
        transformKind: input.kind,
        original,
        transformed
    };
}
