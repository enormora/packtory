import assert from 'node:assert';
import type { LinkedBundle, LinkedBundleResource } from '../linker/linked-bundle.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { bundleResource, linkedBundle } from './bundle-fixtures.ts';

export function inputs(
    ...bundles: readonly LinkedBundle[]
): readonly { readonly bundle: LinkedBundle; readonly transformationsEnabled: boolean; }[] {
    return bundles.map(function (bundle) {
        return { bundle, transformationsEnabled: true };
    });
}

type CodeFileSpec = {
    readonly name: string;
    readonly sourceFilePath: string;
    readonly targetFilePath: string;
    readonly content: string;
    readonly extraResources?: readonly LinkedBundleResource[];
};

export function bundleForCodeFile(spec: CodeFileSpec): LinkedBundle {
    const root = {
        js: {
            content: spec.content,
            isExecutable: false,
            sourceFilePath: spec.sourceFilePath,
            targetFilePath: spec.targetFilePath
        }
    } as const;
    const codeResource = {
        ...bundleResource(spec.sourceFilePath, { content: spec.content, targetFilePath: spec.targetFilePath }),
        isSubstituted: false
    };
    return linkedBundle({
        name: spec.name,
        contents: [ codeResource, ...spec.extraResources ?? [] ],
        roots: { main: root },
        surface: { mode: 'implicit', defaultModuleRoot: 'main' }
    });
}

export function collectTargetPaths(analyzed: AnalyzedBundle | undefined): readonly string[] {
    assert.ok(analyzed !== undefined);
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
