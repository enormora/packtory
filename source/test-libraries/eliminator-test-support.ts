import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import type { AnalyzedBundle, EliminationInput } from '../dead-code-eliminator/analyzed-bundle.ts';
import { assertDefined } from './deep-subset-assertion.ts';
import { bundleResource, linkedBundle } from './bundle-fixtures.ts';

export function inputs(
    ...bundles: readonly LinkedBundle[]
): readonly EliminationInput[] {
    return bundles.map(function (bundle) {
        return { bundle, transformationsEnabled: true, substitutionPublicModuleSourceFilePaths: new Set<string>() };
    });
}

export function inputWithSubstitutionPublicModules(
    bundle: LinkedBundle,
    substitutionPublicModuleSourceFilePaths: ReadonlySet<string>
): readonly EliminationInput[] {
    return [ { bundle, transformationsEnabled: true, substitutionPublicModuleSourceFilePaths } ];
}

export function inputWithoutTransformations(bundle: LinkedBundle): readonly EliminationInput[] {
    return [
        {
            bundle,
            transformationsEnabled: false,
            substitutionPublicModuleSourceFilePaths: new Set<string>()
        }
    ];
}

type CodeFileSpec = {
    readonly name: string;
    readonly sourceFilePath: string;
    readonly targetFilePath: string;
    readonly content: string;
    readonly extraResources?: readonly LinkedBundleResource[];
};

export function bundleForCodeFile(input: CodeFileSpec): LinkedBundle {
    const root = {
        js: {
            content: input.content,
            isExecutable: false,
            sourceFilePath: input.sourceFilePath,
            targetFilePath: input.targetFilePath
        }
    } as const;
    const codeResource = {
        ...bundleResource(input.sourceFilePath, { content: input.content, targetFilePath: input.targetFilePath }),
        isSubstituted: false
    };
    return linkedBundle({
        name: input.name,
        contents: [ codeResource, ...input.extraResources ?? [] ],
        roots: { main: root },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });
}

export function collectTargetPaths(analyzed: AnalyzedBundle | undefined): readonly string[] {
    assertDefined(analyzed);
    return analyzed.contents.map(function (resource) {
        return resource.fileDescription.targetFilePath;
    });
}

export const indexTsContent = [ 'function dead() { return 1; }', 'export function live() { return 2; }' ].join('\n');

export function indexTsBundle(extraResources: readonly LinkedBundleResource[] = []): LinkedBundle {
    return bundleForCodeFile({
        name: 'pkg',
        sourceFilePath: '/src/index.ts',
        targetFilePath: 'index.ts',
        content: indexTsContent,
        extraResources
    });
}

export function producerBundleWith(helpersContent: string): LinkedBundle {
    const producerHelpers = {
        ...bundleResource('/producer/helpers.ts', { content: helpersContent, targetFilePath: 'helpers.ts' }),
        isSubstituted: false
    };
    return linkedBundle({
        name: 'producer',
        contents: [ producerHelpers ],
        roots: {
            main: {
                js: {
                    content: '',
                    isExecutable: false,
                    sourceFilePath: '/producer/index.js',
                    targetFilePath: 'index.js'
                }
            }
        },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });
}

export function consumerBundleWith(content: string): LinkedBundle {
    return bundleForCodeFile({
        name: 'consumer',
        sourceFilePath: '/consumer/index.ts',
        targetFilePath: 'index.ts',
        content
    });
}
