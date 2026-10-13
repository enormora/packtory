import path from 'node:path';
import type { z } from 'zod/mini';
import {
    resolveInstalledPackage,
    type InstalledPackageFileManager,
    packageManifestPathIn
} from '../../common/package-layout.ts';
import { createWorklist } from '../../common/worklist.ts';
import type { PublishedPackageWithManifest } from '../../published-package/published-package.ts';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import {
    readNodeEngineManifest,
    supportsNodeRange,
    validateNodeRange,
    type NodeEngineManifest
} from '../node-engine-manifest.ts';
import {
    emptyPerPackageSchema,
    enabledOnlyGlobalSchema,
    type CheckRuleDefinition,
    type RuleRunInput
} from '../rule.ts';

const ruleName = 'nodeEngineCompatibility';
type GlobalConfig = Readonly<z.infer<typeof enabledOnlyGlobalSchema>>;
type PerPackageConfig = Readonly<z.infer<typeof emptyPerPackageSchema>>;
type RunInput = RuleRunInput<typeof ruleName, GlobalConfig, PerPackageConfig>;

export type NodeEngineCompatibilityRule = CheckRuleDefinition<typeof ruleName, GlobalConfig, PerPackageConfig>;
export const nodeEngineCompatibilitySchemas = {
    globalSchema: enabledOnlyGlobalSchema,
    perPackageSchema: emptyPerPackageSchema
};

export type NodeEngineCompatibilityDependencies = {
    readonly fileManager: InstalledPackageFileManager;
};

type DependencyRequest = {
    readonly name: string;
    readonly fromFolder: string;
    readonly sibling: boolean;
    readonly chain: readonly string[];
};

type DependencyNodeCache = {
    readonly get: (identity: string) => DependencyNode | undefined;
    readonly set: (identity: string, node: DependencyNode) => unknown;
};

type DependencyNode = {
    readonly identity: string;
    readonly folder: string;
    readonly bundle: AnalyzedBundle | undefined;
    readonly manifest: unknown;
};

function sourceFolder(input: RunInput, name: string): string {
    const folder = input.sourceFolders.get(name);
    if (folder === undefined) {
        throw new Error(`Source folder missing for "${name}"`);
    }
    return folder;
}

function dependencySourceFolders(
    input: RunInput,
    bundle: AnalyzedBundle,
    dependencyName: string
): readonly string[] {
    const references = new Set(bundle.externalDependencies.get(dependencyName)?.referencedFrom);
    const folders = bundle.contents.flatMap(function (resource) {
        return references.has(resource.fileDescription.targetFilePath)
            ? [ path.dirname(resource.fileDescription.inputFilePath) ]
            : [];
    });
    return folders.length === 0
        ? [ sourceFolder(input, bundle.name) ]
        : Array.from(new Set(folders)).toSorted(function (left, right) {
            return left.localeCompare(right);
        });
}

function dependencyRequests(
    input: RunInput,
    node: DependencyNode,
    manifest: NodeEngineManifest,
    chain: readonly string[]
): readonly DependencyRequest[] {
    return manifest.requiredDependencyNames.flatMap(function (name) {
        const folders = node.bundle === undefined
            ? [ node.folder ]
            : dependencySourceFolders(input, node.bundle, name);
        return folders.map(function (fromFolder) {
            return {
                name,
                fromFolder,
                sibling: node.bundle?.linkedBundleDependencies.has(name) === true,
                chain
            };
        });
    });
}

function publishedPackageFor(input: RunInput, name: string): PublishedPackageWithManifest {
    const publishedPackage = input.publishedPackages?.get(name);
    if (publishedPackage === undefined) {
        throw new Error(`Published package missing for "${name}"`);
    }
    return publishedPackage;
}

function generatedNode(
    input: RunInput,
    name: string,
    publishedPackage: PublishedPackageWithManifest
): DependencyNode {
    const bundle = input.bundles.find(function (candidate) {
        return candidate.name === name;
    });
    if (bundle === undefined) {
        throw new Error(`Generated package missing for "${name}"`);
    }
    return {
        identity: `generated:${name}`,
        folder: sourceFolder(input, name),
        bundle,
        manifest: publishedPackage.packageJson
    };
}

function engineIssue(rootName: string, chain: readonly string[], message: string): string {
    return `Package "${rootName}" failed Node engine compatibility via ${chain.join(' -> ')}: ${message}`;
}

function findIncompatibleRange(
    rootName: string,
    rootRange: string,
    dependencyRange: string,
    chain: readonly string[]
): readonly string[] {
    const range = validateNodeRange(dependencyRange);
    return supportsNodeRange(rootRange, range)
        ? []
        : [ engineIssue(rootName, chain, `engines.node "${rootRange}" is not a subset of "${range}"`) ];
}

function compareEngine(
    rootName: string,
    rootRange: string,
    dependencyRange: string | undefined,
    chain: readonly string[]
): readonly string[] {
    if (dependencyRange === undefined) {
        return [];
    }
    try {
        return findIncompatibleRange(rootName, rootRange, dependencyRange, chain);
    } catch (error) {
        return [ engineIssue(rootName, chain, String(error)) ];
    }
}

export function createNodeEngineCompatibilityRule(
    dependencies: NodeEngineCompatibilityDependencies
): NodeEngineCompatibilityRule {
    const { fileManager } = dependencies;
    const { readFile: readManifest } = fileManager;

    async function readInstalledNode(folder: string, nodes: DependencyNodeCache): Promise<DependencyNode> {
        const cached = nodes.get(folder);
        if (cached !== undefined) {
            return cached;
        }
        const content = await readManifest(packageManifestPathIn(folder));
        const node = { identity: folder, folder, bundle: undefined, manifest: JSON.parse(content) as unknown };
        nodes.set(folder, node);
        return node;
    }

    async function resolveNode(
        input: RunInput,
        request: DependencyRequest,
        nodes: DependencyNodeCache
    ): Promise<DependencyNode> {
        if (request.sibling) {
            return generatedNode(input, request.name, publishedPackageFor(input, request.name));
        }
        const folder = await resolveInstalledPackage(fileManager, request.name, request.fromFolder);
        if (folder === undefined) {
            throw new Error(`Required dependency "${request.name}" is not installed`);
        }
        return readInstalledNode(folder, nodes);
    }

    async function checkTree(
        input: RunInput,
        root: DependencyNode,
        rootName: string,
        rootRange: string
    ): Promise<readonly string[]> {
        const issues: string[] = [];
        const visited = new Set<string>();
        const nodes = new Map<string, DependencyNode>();
        const pending = createWorklist(dependencyRequests(
            input,
            root,
            readNodeEngineManifest(root.manifest),
            [ rootName ]
        ));

        async function visitRequiredPackage(request: DependencyRequest): Promise<void> {
            const node = await resolveNode(input, request, nodes);
            if (visited.has(node.identity)) {
                return;
            }
            visited.add(node.identity);
            const manifest = readNodeEngineManifest(node.manifest);
            const label = manifest.version === undefined ? request.name : `${request.name}@${manifest.version}`;
            const chain = [ ...request.chain, label ];
            issues.push(...compareEngine(rootName, rootRange, manifest.nodeRange, chain));
            pending.scheduleAll(dependencyRequests(input, node, manifest, chain));
        }

        async function visit(request: DependencyRequest): Promise<void> {
            try {
                await visitRequiredPackage(request);
            } catch (error) {
                issues.push(engineIssue(rootName, [ ...request.chain, request.name ], String(error)));
            }
        }

        for (let request = pending.takeNext(); request !== undefined; request = pending.takeNext()) {
            await visit(request);
        }
        return issues;
    }

    async function checkPackage(input: RunInput, name: string): Promise<readonly string[]> {
        const publishedPackage = publishedPackageFor(input, name);
        const range = publishedPackage.packageJson.engines?.node;
        if (range === undefined) {
            return [];
        }
        try {
            return await checkTree(input, generatedNode(input, name, publishedPackage), name, validateNodeRange(range));
        } catch (error) {
            return [ engineIssue(name, [ name ], String(error)) ];
        }
    }

    return {
        name: ruleName,
        ...nodeEngineCompatibilitySchemas,
        async run(input) {
            if (input.settings?.nodeEngineCompatibility?.enabled !== true) {
                return [];
            }
            const names = input
                .bundles
                .map(function (bundle) {
                    return bundle.name;
                })
                .toSorted(function (left, right) {
                    return left.localeCompare(right);
                });
            const issues: string[] = [];
            for (const name of names) {
                issues.push(...await checkPackage(input, name));
            }
            return issues.toSorted(function (left, right) {
                return left.localeCompare(right);
            });
        }
    };
}
