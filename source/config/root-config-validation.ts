import type { PackageConfig, PackageConfigsByName } from './config.ts';

type ImplicitPackageConfig = Extract<PackageConfig, { readonly packageInterface?: undefined; }>;
type ExplicitPackageConfig = Extract<
    PackageConfig,
    { readonly packageInterface: NonNullable<PackageConfig['packageInterface']>; }
>;

type ExplicitRootEntryResult = {
    readonly issues: readonly string[];
    readonly rootIds: ReadonlySet<string>;
};

type ExplicitRootEntryValidation<TEntry extends { readonly root: string; }> = {
    readonly duplicateLabel: string;
    readonly entries: readonly TEntry[];
    readonly entryNameFor: (entry: TEntry) => string;
    readonly referenceLabel: string;
};

function unknownRootIssue(packageConfig: PackageConfig, referenceName: string, rootId: string): string | undefined {
    if (packageConfig.roots[rootId] === undefined) {
        return `Package "${packageConfig.name}" ${referenceName} references unknown root "${rootId}"`;
    }
    return undefined;
}

function duplicateEntryIssue(
    packageConfig: ExplicitPackageConfig,
    seenValues: ReadonlySet<string>,
    value: string,
    label: string
): string | undefined {
    if (seenValues.has(value)) {
        return `Package "${packageConfig.name}" declares duplicate ${label} "${value}"`;
    }
    return undefined;
}

function definedIssues(...issues: readonly (string | undefined)[]): readonly string[] {
    return issues.filter(function (issue) {
        return issue !== undefined;
    });
}

function validateExplicitRootEntries<TEntry extends { readonly root: string; }>(
    packageConfig: ExplicitPackageConfig,
    validation: ExplicitRootEntryValidation<TEntry>
): ExplicitRootEntryResult {
    const issues: string[] = [];
    const seenValues = new Set<string>();
    const rootIds = new Set<string>();

    for (const entry of validation.entries) {
        const entryName = validation.entryNameFor(entry);
        issues.push(
            ...definedIssues(
                unknownRootIssue(packageConfig, `${validation.referenceLabel} "${entryName}"`, entry.root),
                duplicateEntryIssue(packageConfig, seenValues, entryName, validation.duplicateLabel)
            )
        );
        seenValues.add(entryName);
        rootIds.add(entry.root);
    }

    return { issues, rootIds };
}

function validateExplicitPublicEntries(packageConfig: ExplicitPackageConfig): ExplicitRootEntryResult {
    const modules = validateExplicitRootEntries(packageConfig, {
        duplicateLabel: 'export key',
        entries: packageConfig.packageInterface.modules ?? [],
        entryNameFor(entry) {
            return entry.export;
        },
        referenceLabel: 'module export'
    });
    const bins = validateExplicitRootEntries(packageConfig, {
        duplicateLabel: 'bin name',
        entries: packageConfig.packageInterface.bins ?? [],
        entryNameFor(entry) {
            return entry.name;
        },
        referenceLabel: 'bin'
    });
    return {
        issues: [ ...modules.issues, ...bins.issues ],
        rootIds: new Set([ ...modules.rootIds, ...bins.rootIds ])
    };
}

function validateExplicitPrivateRoots(
    packageConfig: ExplicitPackageConfig,
    publicRootIds: ReadonlySet<string>
): ExplicitRootEntryResult {
    const issues: string[] = [];
    const seenRootIds = new Set<string>();
    const rootIds = new Set<string>();
    const privateRoots = packageConfig.packageInterface.privateRoots ?? [];

    for (const rootId of privateRoots) {
        issues.push(
            ...definedIssues(
                unknownRootIssue(packageConfig, `private root "${rootId}"`, rootId),
                duplicateEntryIssue(packageConfig, seenRootIds, rootId, 'private root'),
                publicRootIds.has(rootId)
                    ? `Package "${packageConfig.name}" root "${rootId}" cannot be both public and private`
                    : undefined
            )
        );
        seenRootIds.add(rootId);
        rootIds.add(rootId);
    }

    return { issues, rootIds };
}

function collectExplicitUnusedRootIssues(
    packageConfig: ExplicitPackageConfig,
    usedRootIds: ReadonlySet<string>
): readonly string[] {
    const issues: string[] = [];

    for (const rootId of Object.keys(packageConfig.roots)) {
        if (!usedRootIds.has(rootId)) {
            issues.push(`Package "${packageConfig.name}" defines unused root "${rootId}" in explicit mode`);
        }
    }

    return issues;
}

function validateExplicitRootConfiguration(packageConfig: ExplicitPackageConfig): readonly string[] {
    const publicEntries = validateExplicitPublicEntries(packageConfig);
    const privateRoots = validateExplicitPrivateRoots(packageConfig, publicEntries.rootIds);
    const usedRootIds = new Set([ ...publicEntries.rootIds, ...privateRoots.rootIds ]);
    return [
        ...publicEntries.issues,
        ...privateRoots.issues,
        ...collectExplicitUnusedRootIssues(packageConfig, usedRootIds)
    ];
}

function validateDuplicateRootJavaScriptTargets(packageConfig: PackageConfig): readonly string[] {
    const issues: string[] = [];
    const jsPaths = new Map<string, string>();

    for (const [ rootId, root ] of Object.entries(packageConfig.roots)) {
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

    if (defaultModuleRoot === undefined && Object.keys(packageConfig.roots).length > 1) {
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
        ]
            .join(' ');
        return [ message, ...issues ];
    }

    return issues;
}

function validateRootConfiguration(packageConfig: PackageConfig): readonly string[] {
    const duplicateRootIssues = validateDuplicateRootJavaScriptTargets(packageConfig);

    if (packageConfig.packageInterface === undefined) {
        return [ ...duplicateRootIssues, ...validateImplicitRootConfiguration(packageConfig) ];
    }

    return [ ...duplicateRootIssues, ...validateExplicitModeConfiguration(packageConfig) ];
}

export function validatePackageSurfaceRules(packageConfigs: PackageConfigsByName): readonly string[] {
    const issues: string[] = [];

    const packageList = Object.values(packageConfigs);
    for (const packageConfig of packageList) {
        issues.push(...validateRootConfiguration(packageConfig));
    }

    return issues;
}
