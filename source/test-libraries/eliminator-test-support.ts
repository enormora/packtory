import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import type { AnalyzedBundle, EliminationInput } from '../dead-code-eliminator/analyzed-bundle.ts';
import { assertDefined } from './deep-subset-assertion.ts';
import { bundleResource, linkedBundle } from './bundle-fixtures.ts';

export function inputs(
    ...bundles: readonly LinkedBundle[]
): readonly EliminationInput[] {
    return bundles.map(function (bundle) {
        return { bundle, transformationsEnabled: true, substitutionPublicModuleInputFilePaths: new Set<string>() };
    });
}

export function inputWithSubstitutionPublicModules(
    bundle: LinkedBundle,
    substitutionPublicModuleInputFilePaths: ReadonlySet<string>
): readonly EliminationInput[] {
    return [ { bundle, transformationsEnabled: true, substitutionPublicModuleInputFilePaths } ];
}

export function inputWithoutTransformations(bundle: LinkedBundle): readonly EliminationInput[] {
    return [
        {
            bundle,
            transformationsEnabled: false,
            substitutionPublicModuleInputFilePaths: new Set<string>()
        }
    ];
}

type CodeFileSpec = {
    readonly name: string;
    readonly inputFilePath: string;
    readonly targetFilePath: string;
    readonly content: string;
    readonly extraResources?: readonly LinkedBundleResource[];
};

function producerTargetFilePath(specifier: string): string {
    return specifier === 'producer' ? 'index.js' : specifier.replace(/^producer\//u, '');
}

function withLinkedProducerReferences(bundleName: string, resource: LinkedBundleResource): LinkedBundleResource {
    if (bundleName !== 'consumer') {
        return resource;
    }
    return {
        ...resource,
        moduleReferences: resource.moduleReferences.map(function (reference) {
            return reference.type === 'external-package' && reference.packageName === 'producer'
                ? {
                    type: 'linked-code',
                    packageName: 'producer',
                    sourceSpecifier: reference.sourceSpecifier,
                    emittedSpecifier: reference.emittedSpecifier,
                    targetFilePath: producerTargetFilePath(reference.emittedSpecifier)
                }
                : reference;
        })
    };
}

export function bundleForCodeFile(input: CodeFileSpec): LinkedBundle {
    const root = {
        js: {
            content: input.content,
            isExecutable: false,
            inputFilePath: input.inputFilePath,
            targetFilePath: input.targetFilePath
        }
    } as const;
    const codeResource = withLinkedProducerReferences(input.name, {
        ...bundleResource(input.inputFilePath, { content: input.content, targetFilePath: input.targetFilePath }),
        isSubstituted: false
    });
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
        inputFilePath: '/src/index.ts',
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
                    inputFilePath: '/producer/index.js',
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
        inputFilePath: '/consumer/index.ts',
        targetFilePath: 'index.ts',
        content
    });
}
