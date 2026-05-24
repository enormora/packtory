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

function validateDuplicateRootJavaScriptTargets(packageConfig: PackageConfig): readonly string[] {
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

function validateImplicitRootConfiguration(packageConfig: ImplicitPackageConfig): readonly string[] {
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

function validateExplicitModules(
    packageConfig: ExplicitPackageConfig,
    state: ExplicitValidationState
): readonly string[] {
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

function validateExplicitBins(packageConfig: ExplicitPackageConfig, state: ExplicitValidationState): readonly string[] {
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

function validateExplicitPrivateRoots(
    packageConfig: ExplicitPackageConfig,
    state: ExplicitValidationState
): readonly string[] {
    return (packageConfig.packageInterface.privateRoots ?? []).flatMap((rootId) => {
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
        state.seenPrivateRootIds.add(rootId);
        state.usedRootIds.add(rootId);
        return issues;
    });
}

function validateExplicitUnusedRoots(
    packageConfig: ExplicitPackageConfig,
    state: ExplicitValidationState
): readonly string[] {
    return Object.keys(packageConfig.roots).flatMap((rootId) => {
        if (state.usedRootIds.has(rootId)) {
            return [];
        }
        return [`Package "${packageConfig.name}" defines unused root "${rootId}" in explicit mode`];
    });
}

function validateExplicitRootConfiguration(packageConfig: ExplicitPackageConfig): readonly string[] {
    const state = createExplicitValidationState();
    return [
        ...validateExplicitModules(packageConfig, state),
        ...validateExplicitBins(packageConfig, state),
        ...validateExplicitPrivateRoots(packageConfig, state),
        ...validateExplicitUnusedRoots(packageConfig, state)
    ];
}

function buildMutualExclusionIssues(packageName: string, defaultModuleRoot: string | undefined): readonly string[] {
    if (defaultModuleRoot === undefined) {
        return [];
    }
    return [
        [
            `Package "${packageName}" cannot combine defaultModuleRoot with packageInterface;`,
            'remove defaultModuleRoot in explicit mode'
        ].join(' ')
    ];
}

function validateRootConfiguration(packageConfig: PackageConfig): readonly string[] {
    const duplicateRootIssues = validateDuplicateRootJavaScriptTargets(packageConfig);

    if (packageConfig.packageInterface === undefined) {
        return [...duplicateRootIssues, ...validateImplicitRootConfiguration(packageConfig)];
    }

    const packageConfigWithBothFields = packageConfig as PackageConfig & {
        readonly defaultModuleRoot?: string | undefined;
    };
    const mutualExclusionIssues = buildMutualExclusionIssues(
        packageConfig.name,
        packageConfigWithBothFields.defaultModuleRoot
    );

    return [...duplicateRootIssues, ...mutualExclusionIssues, ...validateExplicitRootConfiguration(packageConfig)];
}

export function validatePackageSurfaceRules(packageConfigs: PackageConfigsByName): readonly string[] {
    return Object.values(packageConfigs).flatMap(validateRootConfiguration);
}
