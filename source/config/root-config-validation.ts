import type { PackageConfig, PackageConfigsByName } from './config.ts';

type ImplicitPackageConfig = Extract<PackageConfig, { readonly packageInterface?: undefined }>;
type ExplicitPackageConfig = Extract<
    PackageConfig,
    { readonly packageInterface: NonNullable<PackageConfig['packageInterface']> }
>;

type ExplicitRootEntryValidation<TEntry extends { readonly root: string }> = {
    readonly duplicateLabel: string;
    readonly entries: readonly TEntry[];
    readonly entryNameFor: (entry: TEntry) => string;
    readonly referenceLabel: string;
    readonly seenValues: Set<string>;
};

type ExplicitValidationState = {
    readonly issues: string[];
    readonly usedRootIds: Set<string>;
    readonly publicRootIds: Set<string>;
    readonly seenExportKeys: Set<string>;
    readonly seenBinNames: Set<string>;
    readonly seenPrivateRootIds: Set<string>;
};

function createExplicitValidationState(): ExplicitValidationState {
    return {
        issues: [],
        usedRootIds: new Set<string>(),
        publicRootIds: new Set<string>(),
        seenExportKeys: new Set<string>(),
        seenBinNames: new Set<string>(),
        seenPrivateRootIds: new Set<string>()
    };
}

function pushUnknownRootIssue(
    packageConfig: PackageConfig,
    state: Pick<ExplicitValidationState, 'issues'>,
    referenceName: string,
    rootId: string
): void {
    if (packageConfig.roots[rootId] === undefined) {
        state.issues.push(`Package "${packageConfig.name}" ${referenceName} references unknown root "${rootId}"`);
    }
}

function pushDuplicateIssue(
    state: Pick<ExplicitValidationState, 'issues'>,
    seenValues: Set<string>,
    value: string,
    message: string
): void {
    if (seenValues.has(value)) {
        state.issues.push(message);
    }
}

function validateExplicitRootEntries<TEntry extends { readonly root: string }>(
    packageConfig: ExplicitPackageConfig,
    state: ExplicitValidationState,
    validation: ExplicitRootEntryValidation<TEntry>
): void {
    for (const entry of validation.entries) {
        const entryName = validation.entryNameFor(entry);
        pushUnknownRootIssue(packageConfig, state, `${validation.referenceLabel} "${entryName}"`, entry.root);
        pushDuplicateIssue(
            state,
            validation.seenValues,
            entryName,
            `Package "${packageConfig.name}" declares duplicate ${validation.duplicateLabel} "${entryName}"`
        );
        validation.seenValues.add(entryName);
        state.usedRootIds.add(entry.root);
        state.publicRootIds.add(entry.root);
    }
}

function validateExplicitPublicEntries(packageConfig: ExplicitPackageConfig, state: ExplicitValidationState): void {
    validateExplicitRootEntries(packageConfig, state, {
        duplicateLabel: 'export key',
        entries: packageConfig.packageInterface.modules ?? [],
        entryNameFor(entry) {
            return entry.export;
        },
        referenceLabel: 'module export',
        seenValues: state.seenExportKeys
    });
    validateExplicitRootEntries(packageConfig, state, {
        duplicateLabel: 'bin name',
        entries: packageConfig.packageInterface.bins ?? [],
        entryNameFor(entry) {
            return entry.name;
        },
        referenceLabel: 'bin',
        seenValues: state.seenBinNames
    });
}

function validateExplicitPrivateRoots(packageConfig: ExplicitPackageConfig, state: ExplicitValidationState): void {
    for (const rootId of packageConfig.packageInterface.privateRoots ?? []) {
        pushUnknownRootIssue(packageConfig, state, `private root "${rootId}"`, rootId);
        pushDuplicateIssue(
            state,
            state.seenPrivateRootIds,
            rootId,
            `Package "${packageConfig.name}" declares duplicate private root "${rootId}"`
        );
        if (state.publicRootIds.has(rootId)) {
            state.issues.push(`Package "${packageConfig.name}" root "${rootId}" cannot be both public and private`);
        }
        state.seenPrivateRootIds.add(rootId);
        state.usedRootIds.add(rootId);
    }
}

function pushExplicitUnusedRootIssues(packageConfig: ExplicitPackageConfig, state: ExplicitValidationState): void {
    for (const rootId of Object.keys(packageConfig.roots)) {
        if (!state.usedRootIds.has(rootId)) {
            state.issues.push(`Package "${packageConfig.name}" defines unused root "${rootId}" in explicit mode`);
        }
    }
}

function validateExplicitRootConfiguration(packageConfig: ExplicitPackageConfig): readonly string[] {
    const state = createExplicitValidationState();
    validateExplicitPublicEntries(packageConfig, state);
    validateExplicitPrivateRoots(packageConfig, state);
    pushExplicitUnusedRootIssues(packageConfig, state);
    return state.issues;
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
    const { defaultModuleRoot } = packageConfig;
    const issues: string[] = [];

    if (Object.keys(packageConfig.roots).length > 1 && defaultModuleRoot === undefined) {
        issues.push(`Package "${packageConfig.name}" must define defaultModuleRoot when multiple roots exist`);
    }

    if (defaultModuleRoot !== undefined && packageConfig.roots[defaultModuleRoot] === undefined) {
        issues.push(`Package "${packageConfig.name}" references unknown defaultModuleRoot "${defaultModuleRoot}"`);
    }

    return issues;
}

function hasInvalidExplicitDefaultModuleRoot(packageConfig: ExplicitPackageConfig): boolean {
    const packageRecord: Readonly<Record<string, unknown>> = packageConfig;
    const { defaultModuleRoot } = packageRecord;
    return typeof defaultModuleRoot === 'string';
}

function validateExplicitModeConfiguration(packageConfig: ExplicitPackageConfig): readonly string[] {
    const issues = validateExplicitRootConfiguration(packageConfig);

    if (hasInvalidExplicitDefaultModuleRoot(packageConfig)) {
        const message = [
            `Package "${packageConfig.name}" cannot combine defaultModuleRoot with packageInterface;`,
            'remove defaultModuleRoot in explicit mode'
        ].join(' ');
        return [message, ...issues];
    }

    return issues;
}

function validateRootConfiguration(packageConfig: PackageConfig): readonly string[] {
    const duplicateRootIssues = validateDuplicateRootJavaScriptTargets(packageConfig);

    if (packageConfig.packageInterface === undefined) {
        return [...duplicateRootIssues, ...validateImplicitRootConfiguration(packageConfig)];
    }

    return [...duplicateRootIssues, ...validateExplicitModeConfiguration(packageConfig)];
}

export function validatePackageSurfaceRules(packageConfigs: PackageConfigsByName): readonly string[] {
    const issues: string[] = [];

    for (const packageConfig of Object.values(packageConfigs)) {
        issues.push(...validateRootConfiguration(packageConfig));
    }

    return issues;
}
