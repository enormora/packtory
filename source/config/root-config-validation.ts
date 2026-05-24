import type { PackageConfig, PackageConfigsByName } from './config.ts';

type ImplicitPackageConfig = Extract<PackageConfig, { readonly packageInterface?: undefined }>;
type ExplicitPackageConfig = Extract<
    PackageConfig,
    { readonly packageInterface: NonNullable<PackageConfig['packageInterface']> }
>;

type ExplicitValidationState = {
    readonly usedRootIds: Set<string>;
    readonly publicRootIds: Set<string>;
    readonly seenExportKeys: Set<string>;
    readonly seenBinNames: Set<string>;
    readonly seenPrivateRootIds: Set<string>;
};

function createExplicitValidationState(): ExplicitValidationState {
    return {
        usedRootIds: new Set<string>(),
        publicRootIds: new Set<string>(),
        seenExportKeys: new Set<string>(),
        seenBinNames: new Set<string>(),
        seenPrivateRootIds: new Set<string>()
    };
}

function validateDuplicateRootJavaScriptTargets(packageConfig: PackageConfig): string[] {
    const issues: string[] = [];
    const jsPaths = new Map<string, string>();

    for (const [rootId, root] of Object.entries(packageConfig.roots)) {
        const previous = jsPaths.get(root.js);
        if (previous === undefined) {
            jsPaths.set(root.js, rootId);
        } else {
            issues.push(`Package "${packageConfig.name}" maps both root "${previous}" and "${rootId}" to "${root.js}"`);
        }
    }

    return issues;
}

function validateImplicitRootConfiguration(packageConfig: ImplicitPackageConfig): string[] {
    const rootIds = Object.keys(packageConfig.roots);
    const issues: string[] = [];
    const { defaultModuleRoot } = packageConfig;

    if (rootIds.length > 1 && defaultModuleRoot === undefined) {
        issues.push(`Package "${packageConfig.name}" must define defaultModuleRoot when multiple roots exist`);
    }

    if (defaultModuleRoot !== undefined && packageConfig.roots[defaultModuleRoot] === undefined) {
        issues.push(`Package "${packageConfig.name}" references unknown defaultModuleRoot "${defaultModuleRoot}"`);
    }

    return issues;
}

function validateExplicitModules(packageConfig: ExplicitPackageConfig, state: ExplicitValidationState): string[] {
    const issues: string[] = [];
    for (const entry of packageConfig.packageInterface.modules ?? []) {
        if (packageConfig.roots[entry.root] === undefined) {
            issues.push(
                [
                    `Package "${packageConfig.name}" module export "${entry.export}"`,
                    `references unknown root "${entry.root}"`
                ].join(' ')
            );
        }
        if (state.seenExportKeys.has(entry.export)) {
            issues.push(`Package "${packageConfig.name}" declares duplicate export key "${entry.export}"`);
        }
        state.seenExportKeys.add(entry.export);
        state.usedRootIds.add(entry.root);
        state.publicRootIds.add(entry.root);
    }
    return issues;
}

function validateExplicitBins(packageConfig: ExplicitPackageConfig, state: ExplicitValidationState): string[] {
    const issues: string[] = [];
    for (const entry of packageConfig.packageInterface.bins ?? []) {
        if (packageConfig.roots[entry.root] === undefined) {
            issues.push(`Package "${packageConfig.name}" bin "${entry.name}" references unknown root "${entry.root}"`);
        }
        if (state.seenBinNames.has(entry.name)) {
            issues.push(`Package "${packageConfig.name}" declares duplicate bin name "${entry.name}"`);
        }
        state.seenBinNames.add(entry.name);
        state.usedRootIds.add(entry.root);
        state.publicRootIds.add(entry.root);
    }
    return issues;
}

function collectPrivateRootIssues(
    packageConfig: ExplicitPackageConfig,
    state: ExplicitValidationState,
    rootId: string
): string[] {
    const issues: string[] = [];
    if (packageConfig.roots[rootId] === undefined) {
        issues.push(`Package "${packageConfig.name}" private root "${rootId}" references unknown root "${rootId}"`);
    }
    if (state.seenPrivateRootIds.has(rootId)) {
        issues.push(`Package "${packageConfig.name}" declares duplicate private root "${rootId}"`);
    }
    if (state.publicRootIds.has(rootId)) {
        issues.push(`Package "${packageConfig.name}" root "${rootId}" cannot be both public and private`);
    }
    return issues;
}

function validateExplicitPrivateRoots(packageConfig: ExplicitPackageConfig, state: ExplicitValidationState): string[] {
    const issues: string[] = [];
    for (const rootId of packageConfig.packageInterface.privateRoots ?? []) {
        issues.push(...collectPrivateRootIssues(packageConfig, state, rootId));
        state.seenPrivateRootIds.add(rootId);
        state.usedRootIds.add(rootId);
    }
    return issues;
}

function validateExplicitUnusedRoots(packageConfig: ExplicitPackageConfig, state: ExplicitValidationState): string[] {
    const issues: string[] = [];
    for (const rootId of Object.keys(packageConfig.roots)) {
        if (!state.usedRootIds.has(rootId)) {
            issues.push(`Package "${packageConfig.name}" defines unused root "${rootId}" in explicit mode`);
        }
    }
    return issues;
}

function validateExplicitRootConfiguration(packageConfig: ExplicitPackageConfig): string[] {
    const state = createExplicitValidationState();
    const issues = validateExplicitModules(packageConfig, state);
    issues.push(
        ...validateExplicitBins(packageConfig, state),
        ...validateExplicitPrivateRoots(packageConfig, state),
        ...validateExplicitUnusedRoots(packageConfig, state)
    );
    return issues;
}

function buildMutualExclusionIssue(packageName: string, defaultModuleRoot: string | undefined): string | undefined {
    if (defaultModuleRoot === undefined) {
        return undefined;
    }
    return [
        `Package "${packageName}" cannot combine defaultModuleRoot with packageInterface;`,
        'remove defaultModuleRoot in explicit mode'
    ].join(' ');
}

function validateRootConfiguration(packageConfig: PackageConfig): readonly string[] {
    const issues = validateDuplicateRootJavaScriptTargets(packageConfig);

    if (packageConfig.packageInterface === undefined) {
        issues.push(...validateImplicitRootConfiguration(packageConfig));
        return issues;
    }

    const defaultModuleRoot = 'defaultModuleRoot' in packageConfig ? packageConfig.defaultModuleRoot : undefined;
    const mutualExclusionIssue = buildMutualExclusionIssue(packageConfig.name, defaultModuleRoot);
    if (mutualExclusionIssue !== undefined) {
        issues.push(mutualExclusionIssue);
    }

    issues.push(...validateExplicitRootConfiguration(packageConfig));
    return issues;
}

export function validatePackageSurfaceRules(packageConfigs: PackageConfigsByName): readonly string[] {
    return Object.values(packageConfigs).flatMap(validateRootConfiguration);
}
