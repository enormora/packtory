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

const producerPackageName = 'pkg-producer';
const consumerPackageName = 'pkg-consumer';
const producerIndexTargetPath = 'pkg-producer/index.js';
const producerBaseSharedTargetPath = 'pkg-producer/base-shared.js';
const producerBaseSharedDeclarationTargetPath = 'pkg-producer/base-shared.d.ts';
const producerSharedTargetPath = 'pkg-producer/shared.js';
const producerSharedDeclarationTargetPath = 'pkg-producer/shared.d.ts';
const producerPluginTargetPath = 'pkg-producer/plugin.js';
const consumerIndexTargetPath = 'pkg-consumer/index.js';
const producerIndexSourcePath = '/src/pkg-producer/index.js';
const producerBaseSharedSourcePath = '/src/pkg-producer/base-shared.js';
const producerBaseSharedDeclarationSourcePath = '/src/pkg-producer/base-shared.d.ts';
const producerSharedSourcePath = '/src/pkg-producer/shared.js';
const producerSharedDeclarationSourcePath = '/src/pkg-producer/shared.d.ts';
const producerPluginSourcePath = '/src/pkg-producer/plugin.js';
const consumerIndexSourcePath = '/src/pkg-consumer/index.js';

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

function rootApiDeclaration(): DeadCodeEliminationGeneratedFile {
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
            'import { baseSharedConfig } from "pkg-producer/pkg-producer/base-shared.js";',
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
            ? [ rootApiDeclaration(), baseSharedDeclaration(), sharedDeclaration() ]
            : [ rootApiDeclaration() ],
        assetFiles: [],
        rootTargetFilePath: producerIndexTargetPath,
        rootDeclarationTargetFilePath: 'pkg-producer/index.d.ts'
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
        rootDeclarationTargetFilePath: 'pkg-consumer/index.d.ts'
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
