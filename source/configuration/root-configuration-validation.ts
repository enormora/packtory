import type { PackageConfiguration, PackageConfigurationsByName } from './configuration.ts';

type ImplicitPackageConfiguration = Extract<PackageConfiguration, { readonly packageInterface?: undefined; }>;
type ExplicitPackageConfiguration = Extract<
    PackageConfiguration,
    { readonly packageInterface: NonNullable<PackageConfiguration['packageInterface']>; }
>;

type ExplicitRootEntryResult = {
    readonly issues: readonly string[];
    readonly rootIdentifiers: ReadonlySet<string>;
};

type ExplicitRootEntryValidation<TEntry extends { readonly root: string; }> = {
    readonly duplicateLabel: string;
    readonly entries: readonly TEntry[];
    readonly entryNameFor: (entry: TEntry) => string;
    readonly referenceLabel: string;
};

function unknownRootIssue(
    packageConfiguration: PackageConfiguration,
    referenceName: string,
    rootIdentifier: string
): string | undefined {
    if (packageConfiguration.roots[rootIdentifier] === undefined) {
        return `Package "${packageConfiguration.name}" ${referenceName} references unknown root "${rootIdentifier}"`;
    }
    return undefined;
}

function duplicateEntryIssue(
    packageConfiguration: ExplicitPackageConfiguration,
    seenValues: ReadonlySet<string>,
    value: string,
    label: string
): string | undefined {
    if (seenValues.has(value)) {
        return `Package "${packageConfiguration.name}" declares duplicate ${label} "${value}"`;
    }
    return undefined;
}

function definedIssues(...issues: readonly (string | undefined)[]): readonly string[] {
    return issues.filter(function (issue) {
        return issue !== undefined;
    });
}

function validateExplicitRootEntries<TEntry extends { readonly root: string; }>(
    packageConfiguration: ExplicitPackageConfiguration,
    validation: ExplicitRootEntryValidation<TEntry>
): ExplicitRootEntryResult {
    const issues: string[] = [];
    const seenValues = new Set<string>();
    const rootIdentifiers = new Set<string>();

    for (const entry of validation.entries) {
        const entryName = validation.entryNameFor(entry);
        issues.push(
            ...definedIssues(
                unknownRootIssue(packageConfiguration, `${validation.referenceLabel} "${entryName}"`, entry.root),
                duplicateEntryIssue(packageConfiguration, seenValues, entryName, validation.duplicateLabel)
            )
        );
        seenValues.add(entryName);
        rootIdentifiers.add(entry.root);
    }

    return { issues, rootIdentifiers };
}

function validateExplicitPublicEntries(packageConfiguration: ExplicitPackageConfiguration): ExplicitRootEntryResult {
    const modules = validateExplicitRootEntries(packageConfiguration, {
        duplicateLabel: 'export key',
        entries: packageConfiguration.packageInterface.modules ?? [],
        entryNameFor(entry) {
            return entry.export;
        },
        referenceLabel: 'module export'
    });
    const executables = validateExplicitRootEntries(packageConfiguration, {
        duplicateLabel: 'bin name',
        entries: packageConfiguration.packageInterface.executables ?? [],
        entryNameFor(entry) {
            return entry.name;
        },
        referenceLabel: 'bin'
    });
    return {
        issues: [ ...modules.issues, ...executables.issues ],
        rootIdentifiers: new Set([ ...modules.rootIdentifiers, ...executables.rootIdentifiers ])
    };
}

function validateExplicitPrivateRoots(
    packageConfiguration: ExplicitPackageConfiguration,
    publicRootIdentifiers: ReadonlySet<string>
): ExplicitRootEntryResult {
    const packageName = packageConfiguration.name;
    const issues: string[] = [];
    const seenRootIdentifiers = new Set<string>();
    const rootIdentifiers = new Set<string>();
    const privateRoots = packageConfiguration.packageInterface.privateRoots ?? [];

    for (const rootIdentifier of privateRoots) {
        issues.push(
            ...definedIssues(
                unknownRootIssue(packageConfiguration, `private root "${rootIdentifier}"`, rootIdentifier),
                duplicateEntryIssue(packageConfiguration, seenRootIdentifiers, rootIdentifier, 'private root'),
                publicRootIdentifiers.has(rootIdentifier)
                    ? `Package "${packageName}" root "${rootIdentifier}" cannot be both public and private`
                    : undefined
            )
        );
        seenRootIdentifiers.add(rootIdentifier);
        rootIdentifiers.add(rootIdentifier);
    }

    return { issues, rootIdentifiers };
}

function collectExplicitUnusedRootIssues(
    packageConfiguration: ExplicitPackageConfiguration,
    usedRootIdentifiers: ReadonlySet<string>
): readonly string[] {
    const issues: string[] = [];

    for (const rootIdentifier of Object.keys(packageConfiguration.roots)) {
        if (!usedRootIdentifiers.has(rootIdentifier)) {
            issues.push(
                `Package "${packageConfiguration.name}" defines unused root "${rootIdentifier}" in explicit mode`
            );
        }
    }

    return issues;
}

function validateExplicitRootConfiguration(packageConfiguration: ExplicitPackageConfiguration): readonly string[] {
    const publicEntries = validateExplicitPublicEntries(packageConfiguration);
    const privateRoots = validateExplicitPrivateRoots(packageConfiguration, publicEntries.rootIdentifiers);
    const usedRootIdentifiers = new Set([ ...publicEntries.rootIdentifiers, ...privateRoots.rootIdentifiers ]);
    return [
        ...publicEntries.issues,
        ...privateRoots.issues,
        ...collectExplicitUnusedRootIssues(packageConfiguration, usedRootIdentifiers)
    ];
}

function validateDuplicateRootJavaScriptTargets(packageConfiguration: PackageConfiguration): readonly string[] {
    const packageName = packageConfiguration.name;
    const issues: string[] = [];
    const javaScriptPaths = new Map<string, string>();

    for (const [ rootIdentifier, root ] of Object.entries(packageConfiguration.roots)) {
        const previous = javaScriptPaths.get(root.javaScript);
        if (previous === undefined) {
            javaScriptPaths.set(root.javaScript, rootIdentifier);
        } else {
            issues.push(
                `Package "${packageName}" maps both root "${previous}" and "${rootIdentifier}" to "${root.javaScript}"`
            );
        }
    }

    return issues;
}

function validateImplicitRootConfiguration(packageConfiguration: ImplicitPackageConfiguration): readonly string[] {
    const { defaultModuleRoot } = packageConfiguration;
    const issues: string[] = [];

    if (defaultModuleRoot === undefined && Object.keys(packageConfiguration.roots).length > 1) {
        issues.push(`Package "${packageConfiguration.name}" must define defaultModuleRoot when multiple roots exist`);
    }

    if (defaultModuleRoot !== undefined && packageConfiguration.roots[defaultModuleRoot] === undefined) {
        issues.push(
            `Package "${packageConfiguration.name}" references unknown defaultModuleRoot "${defaultModuleRoot}"`
        );
    }

    return issues;
}

function hasInvalidExplicitDefaultModuleRoot(packageConfiguration: ExplicitPackageConfiguration): boolean {
    const packageRecord: Readonly<Record<string, unknown>> = packageConfiguration;
    const { defaultModuleRoot } = packageRecord;
    return typeof defaultModuleRoot === 'string';
}

function validateExplicitModeConfiguration(packageConfiguration: ExplicitPackageConfiguration): readonly string[] {
    const issues = validateExplicitRootConfiguration(packageConfiguration);

    if (hasInvalidExplicitDefaultModuleRoot(packageConfiguration)) {
        const message = [
            `Package "${packageConfiguration.name}" cannot combine defaultModuleRoot with packageInterface;`,
            'remove defaultModuleRoot in explicit mode'
        ]
            .join(' ');
        return [ message, ...issues ];
    }

    return issues;
}

function validateRootConfiguration(packageConfiguration: PackageConfiguration): readonly string[] {
    const duplicateRootIssues = validateDuplicateRootJavaScriptTargets(packageConfiguration);

    if (packageConfiguration.packageInterface === undefined) {
        return [ ...duplicateRootIssues, ...validateImplicitRootConfiguration(packageConfiguration) ];
    }

    return [ ...duplicateRootIssues, ...validateExplicitModeConfiguration(packageConfiguration) ];
}

export function validatePackageSurfaceRules(packageConfigurations: PackageConfigurationsByName): readonly string[] {
    const issues: string[] = [];

    const packageList = Object.values(packageConfigurations);
    for (const packageConfiguration of packageList) {
        issues.push(...validateRootConfiguration(packageConfiguration));
    }

    return issues;
}
