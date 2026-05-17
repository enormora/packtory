import type { PackageJson } from 'type-fest';
import { isImplicitPackageSurface, type PackageSurface } from './surface.ts';

type RootFileDescription = {
    readonly js: {
        readonly sourceFilePath: string;
        readonly targetFilePath: string;
        readonly isExecutable: boolean;
        readonly content: string;
    };
    readonly declarationFile?: { readonly sourceFilePath: string; readonly targetFilePath: string } | undefined;
};

type BundleLike = {
    readonly name: string;
    readonly exportPackageJson?: true | undefined;
    readonly roots: Readonly<Record<string, RootFileDescription>>;
    readonly surface: PackageSurface;
    readonly contents: readonly {
        readonly fileDescription: { readonly sourceFilePath: string; readonly targetFilePath: string };
    }[];
};

type ExplicitSurface = Extract<PackageSurface, { readonly mode: 'explicit' }>;
type ImplicitSurface = Extract<PackageSurface, { readonly mode: 'implicit' }>;
type SurfaceBundleLike = Pick<BundleLike, 'name' | 'roots' | 'surface'>;

type ExportsField = NonNullable<PackageJson['exports']>;
type ExportEntry = Readonly<Record<string, unknown>>;
const packageJsonExportKey = './package.json';
const packageJsonExportTarget = './package.json';
const exportKeyPrefixLength = 2;
type ExplicitPackageInterface = ExplicitSurface['packageInterface'];
type ImplicitSpecifierResolution = readonly ['content', string] | readonly ['private'] | readonly ['root'];
type PackageJsonExportLike = {
    readonly exportPackageJson?: true | undefined;
};

function getRoot(bundle: Pick<BundleLike, 'name' | 'roots'>, rootId: string): RootFileDescription {
    const root = bundle.roots[rootId];
    if (root === undefined) {
        throw new Error(`Package "${bundle.name}" references unknown root "${rootId}"`);
    }
    return root;
}

function toImportTarget(targetFilePath: string): string {
    return `./${targetFilePath}`;
}

function toPackageSpecifier(packageName: string, exportKey: string): string {
    return exportKey === '.' ? packageName : `${packageName}/${exportKey.slice(exportKeyPrefixLength)}`;
}

function resolveExplicitExportKey(packageName: string, specifier: string): string | undefined {
    if (specifier === packageName) {
        return '.';
    }
    if (specifier.startsWith(`${packageName}/`)) {
        return `./${specifier.slice(packageName.length + 1)}`;
    }
    return undefined;
}

function isShebangContent(content: string): boolean {
    return content.startsWith('#!');
}

function isDeclarationTargetFilePath(targetFilePath: string): boolean {
    return targetFilePath.endsWith('.d.ts') || targetFilePath.endsWith('.d.mts') || targetFilePath.endsWith('.d.cts');
}

function isMatchingRootSourcePath(root: RootFileDescription, sourceFilePath: string): boolean {
    if (root.js.sourceFilePath === sourceFilePath) {
        return true;
    }

    return root.declarationFile?.sourceFilePath === sourceFilePath;
}

function shouldPreferExplicitExportKey(candidateExportKey: string, currentExportKey: string): boolean {
    return candidateExportKey.length < currentExportKey.length;
}

function getMatchingExplicitModules(
    bundle: Pick<BundleLike, 'name' | 'roots'>,
    packageInterface: ExplicitPackageInterface,
    sourceFilePath: string
): readonly NonNullable<ExplicitPackageInterface['modules']>[number][] {
    return (packageInterface.modules ?? []).filter((entry) => {
        const root = getRoot(bundle, entry.root);
        return isMatchingRootSourcePath(root, sourceFilePath);
    });
}

function selectPreferredExplicitExportKey(
    modules: readonly NonNullable<ExplicitPackageInterface['modules']>[number][]
): string | undefined {
    const [firstMatch, ...remainingMatches] = modules;
    if (firstMatch === undefined) {
        return undefined;
    }

    let bestMatch = firstMatch.export;
    for (const entry of remainingMatches) {
        if (shouldPreferExplicitExportKey(entry.export, bestMatch)) {
            bestMatch = entry.export;
        }
    }

    return bestMatch;
}

function resolveExplicitExportKeyForSourcePath(
    bundle: Pick<BundleLike, 'name' | 'roots'>,
    packageInterface: ExplicitPackageInterface,
    sourceFilePath: string
): string | undefined {
    return selectPreferredExplicitExportKey(getMatchingExplicitModules(bundle, packageInterface, sourceFilePath));
}

function buildExportEntry(root: RootFileDescription): ExportEntry {
    return {
        import: toImportTarget(root.js.targetFilePath),
        ...(root.declarationFile === undefined ? {} : { types: toImportTarget(root.declarationFile.targetFilePath) })
    };
}

function findContent(
    bundle: Pick<BundleLike, 'contents' | 'name'>,
    sourceFilePath: string
): BundleLike['contents'][number] {
    const content = bundle.contents.find((entry) => {
        return entry.fileDescription.sourceFilePath === sourceFilePath;
    });
    if (content === undefined) {
        throw new Error(`Package "${bundle.name}" is missing content for "${sourceFilePath}"`);
    }
    return content;
}

function isRootJavaScriptSourcePath(root: RootFileDescription, sourceFilePath: string): boolean {
    return root.js.sourceFilePath === sourceFilePath;
}

function isRootSourcePath(bundle: Pick<BundleLike, 'roots'>, sourceFilePath: string): boolean {
    return Object.values(bundle.roots).some((root) => {
        return isRootJavaScriptSourcePath(root, sourceFilePath);
    });
}

function buildExplicitExportsEntries(
    bundle: BundleLike,
    surface: ExplicitSurface
): readonly (readonly [string, ExportEntry])[] {
    return (surface.packageInterface.modules ?? []).map((entry) => {
        return [entry.export, buildExportEntry(getRoot(bundle, entry.root))] satisfies [string, ExportEntry];
    });
}

function maybeAddPackageJsonExport<TExports extends Record<string, ExportEntry | string>>(
    bundle: PackageJsonExportLike,
    exportsField: TExports
): TExports {
    if (bundle.exportPackageJson !== true) {
        return exportsField;
    }

    return { ...exportsField, [packageJsonExportKey]: packageJsonExportTarget };
}

function buildExplicitExportsField(bundle: BundleLike, surface: ExplicitSurface): ExportsField {
    const exportsEntries = buildExplicitExportsEntries(bundle, surface);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- export entries are built as package.json-compatible records
    return maybeAddPackageJsonExport(bundle, Object.fromEntries(exportsEntries)) as ExportsField;
}

function buildImplicitRootExports(bundle: BundleLike, surface: ImplicitSurface): Record<string, ExportEntry> {
    const defaultRoot = getRoot(bundle, surface.defaultModuleRoot);
    const exportsField: Record<string, ExportEntry> = {
        '.': buildExportEntry(defaultRoot)
    };

    for (const [rootId, root] of Object.entries(bundle.roots)) {
        if (rootId !== surface.defaultModuleRoot) {
            exportsField[`./${root.js.targetFilePath}`] = buildExportEntry(root);
        }
    }

    return exportsField;
}

const jsExtensionToDeclarationExtension: ReadonlyMap<string, string> = new Map([
    ['.mjs', '.d.mts'],
    ['.cjs', '.d.cts'],
    ['.js', '.d.ts']
]);

function findContentWithTargetFilePath(bundle: BundleLike, targetFilePath: string): string | undefined {
    const match = bundle.contents.find((entry) => {
        return entry.fileDescription.targetFilePath === targetFilePath;
    });
    return match?.fileDescription.targetFilePath;
}

function findDeclarationCompanionTargetPath(bundle: BundleLike, jsTargetFilePath: string): string | undefined {
    for (const [jsExtension, declarationExtension] of jsExtensionToDeclarationExtension) {
        if (jsTargetFilePath.endsWith(jsExtension)) {
            const candidateTargetPath = `${jsTargetFilePath.slice(0, -jsExtension.length)}${declarationExtension}`;
            return findContentWithTargetFilePath(bundle, candidateTargetPath);
        }
    }
    return undefined;
}

function buildSubstitutionExportEntry(
    bundle: BundleLike,
    sourceFilePath: string
): readonly [string, ExportEntry] | undefined {
    if (isRootSourcePath(bundle, sourceFilePath)) {
        return undefined;
    }

    const content = findContent(bundle, sourceFilePath);
    const jsTargetFilePath = content.fileDescription.targetFilePath;
    if (isDeclarationTargetFilePath(jsTargetFilePath)) {
        return undefined;
    }

    const declarationTargetFilePath = findDeclarationCompanionTargetPath(bundle, jsTargetFilePath);
    return [
        `./${jsTargetFilePath}`,
        {
            import: toImportTarget(jsTargetFilePath),
            ...(declarationTargetFilePath === undefined ? {} : { types: toImportTarget(declarationTargetFilePath) })
        }
    ];
}

function collectImplicitSubstitutionExports(
    bundle: BundleLike,
    substitutionPublicModuleSourcePaths: ReadonlySet<string>
): Record<string, ExportEntry> {
    const substitutionExports: Record<string, ExportEntry> = {};

    for (const sourceFilePath of substitutionPublicModuleSourcePaths) {
        const substitutionExportEntry = buildSubstitutionExportEntry(bundle, sourceFilePath);
        if (substitutionExportEntry !== undefined) {
            const [exportKey, exportEntry] = substitutionExportEntry;
            substitutionExports[exportKey] = exportEntry;
        }
    }

    return substitutionExports;
}

function buildImplicitExportsField(
    bundle: BundleLike,
    surface: ImplicitSurface,
    substitutionPublicModuleSourcePaths: ReadonlySet<string>
): ExportsField {
    const completedExportsField = {
        ...buildImplicitRootExports(bundle, surface),
        ...collectImplicitSubstitutionExports(bundle, substitutionPublicModuleSourcePaths)
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- export entries are built as package.json-compatible records
    return maybeAddPackageJsonExport(bundle, completedExportsField) as ExportsField;
}

function unscopedPackageName(packageName: string): string {
    return packageName.replace(/^@[^/]+\//u, '');
}

function validateExplicitBinRoot(
    bundleName: string,
    entryName: string,
    root: RootFileDescription
): RootFileDescription {
    if (!root.js.isExecutable || !isShebangContent(root.js.content)) {
        throw new Error(
            [
                `Package "${bundleName}" bin "${entryName}" must point to a root`,
                'with a shebang and executable bit'
            ].join(' ')
        );
    }

    return root;
}

function buildExplicitBinEntries(
    bundle: SurfaceBundleLike,
    bins: NonNullable<ExplicitSurface['packageInterface']['bins']>
): readonly (readonly [string, string])[] {
    return bins.map((entry) => {
        const root = validateExplicitBinRoot(bundle.name, entry.name, getRoot(bundle, entry.root));
        return [entry.name, toImportTarget(root.js.targetFilePath)];
    });
}

function buildExplicitBinField(bundle: SurfaceBundleLike, surface: ExplicitSurface): PackageJson['bin'] | undefined {
    const { bins } = surface.packageInterface;
    if (bins === undefined) {
        return undefined;
    }

    return Object.fromEntries(buildExplicitBinEntries(bundle, bins));
}

function getInferredExecutableRoots(bundle: Pick<BundleLike, 'roots'>): readonly RootFileDescription[] {
    return Object.values(bundle.roots).filter((root) => {
        return root.js.isExecutable && isShebangContent(root.js.content);
    });
}

function buildImplicitBinField(bundle: SurfaceBundleLike): PackageJson['bin'] | undefined {
    const [root, extraRoot] = getInferredExecutableRoots(bundle);
    if (root === undefined) {
        return undefined;
    }

    if (extraRoot !== undefined) {
        throw new Error(
            `Package "${bundle.name}" has multiple executable shebang roots; declare packageInterface.bins explicitly`
        );
    }

    return { [unscopedPackageName(bundle.name)]: toImportTarget(root.js.targetFilePath) };
}

function getExplicitPublicModuleSpecifierForSourcePath(
    bundle: BundleLike,
    surface: ExplicitSurface,
    sourceFilePath: string
): string | undefined {
    const explicitExportKey = resolveExplicitExportKeyForSourcePath(bundle, surface.packageInterface, sourceFilePath);
    return explicitExportKey === undefined ? undefined : toPackageSpecifier(bundle.name, explicitExportKey);
}

function getDefaultImplicitPublicModuleSpecifier(
    bundle: BundleLike,
    surface: ImplicitSurface,
    sourceFilePath: string
): string | undefined {
    const defaultRoot = getRoot(bundle, surface.defaultModuleRoot);
    return isMatchingRootSourcePath(defaultRoot, sourceFilePath) ? bundle.name : undefined;
}

function getDeclarationImplicitPublicModuleSpecifier(
    bundle: Pick<BundleLike, 'name' | 'roots'>,
    sourceFilePath: string
): string | undefined {
    const declarationRoot = Object.values(bundle.roots).find((root) => {
        return root.declarationFile?.sourceFilePath === sourceFilePath;
    });

    return declarationRoot === undefined ? undefined : `${bundle.name}/${declarationRoot.js.targetFilePath}`;
}

function getContentPublicModuleSpecifier(
    bundle: Pick<BundleLike, 'contents' | 'name'>,
    sourceFilePath: string
): string | undefined {
    const content = bundle.contents.find((entry) => {
        return entry.fileDescription.sourceFilePath === sourceFilePath;
    });

    return content === undefined ? undefined : `${bundle.name}/${content.fileDescription.targetFilePath}`;
}

function getImplicitPublicModuleSpecifierForSourcePath(
    bundle: BundleLike,
    surface: ImplicitSurface,
    sourceFilePath: string
): string | undefined {
    const defaultSpecifier = getDefaultImplicitPublicModuleSpecifier(bundle, surface, sourceFilePath);
    if (defaultSpecifier !== undefined) {
        return defaultSpecifier;
    }

    const declarationSpecifier = getDeclarationImplicitPublicModuleSpecifier(bundle, sourceFilePath);
    return declarationSpecifier ?? getContentPublicModuleSpecifier(bundle, sourceFilePath);
}

function resolveExplicitPublicModuleSourceFilePath(
    bundle: BundleLike,
    surface: ExplicitSurface,
    specifier: string
): string | undefined {
    const exportKey = resolveExplicitExportKey(bundle.name, specifier);
    if (exportKey === undefined) {
        return undefined;
    }

    const { modules } = surface.packageInterface;
    if (modules === undefined) {
        return undefined;
    }

    const matchingEntry = modules.find((entry) => {
        return entry.export === exportKey;
    });

    return matchingEntry === undefined ? undefined : getRoot(bundle, matchingEntry.root).js.sourceFilePath;
}

function resolveImplicitSpecifier(bundleName: string, specifier: string): ImplicitSpecifierResolution {
    if (specifier === bundleName) {
        return ['root'];
    }

    const prefix = `${bundleName}/`;
    if (!specifier.startsWith(prefix)) {
        return ['private'];
    }

    return ['content', specifier.slice(prefix.length)];
}

function resolveImplicitPublicModuleSourceFilePath(
    bundle: BundleLike,
    surface: ImplicitSurface,
    specifier: string
): string | undefined {
    const [kind, targetFilePath] = resolveImplicitSpecifier(bundle.name, specifier);
    const handlers = {
        root: (): string => {
            return getRoot(bundle, surface.defaultModuleRoot).js.sourceFilePath;
        },
        content: (): string | undefined => {
            return bundle.contents.find((entry) => {
                return entry.fileDescription.targetFilePath === targetFilePath;
            })?.fileDescription.sourceFilePath;
        }
    } satisfies Readonly<Record<Exclude<ImplicitSpecifierResolution[0], 'private'>, () => string | undefined>>;

    return kind === 'private' ? undefined : handlers[kind]();
}

function getPublicRootIds(bundle: Pick<BundleLike, 'roots' | 'surface'>): ReadonlySet<string> {
    if (isImplicitPackageSurface(bundle.surface)) {
        return new Set(Object.keys(bundle.roots));
    }

    const rootIds = new Set<string>();
    for (const entry of bundle.surface.packageInterface.modules ?? []) {
        rootIds.add(entry.root);
    }
    for (const entry of bundle.surface.packageInterface.bins ?? []) {
        rootIds.add(entry.root);
    }

    return rootIds;
}

export function getEntryRootIds(bundle: Pick<BundleLike, 'roots' | 'surface'>): ReadonlySet<string> {
    const publicRootIds = getPublicRootIds(bundle);
    if (isImplicitPackageSurface(bundle.surface)) {
        return publicRootIds;
    }

    return new Set([...publicRootIds, ...(bundle.surface.packageInterface.privateRoots ?? [])]);
}

export function getPublicModuleSpecifierForSourcePath(bundle: BundleLike, sourceFilePath: string): string | undefined {
    if (bundle.surface.mode === 'explicit') {
        return getExplicitPublicModuleSpecifierForSourcePath(bundle, bundle.surface, sourceFilePath);
    }
    return getImplicitPublicModuleSpecifierForSourcePath(bundle, bundle.surface, sourceFilePath);
}

export function resolvePublicModuleSourceFilePath(bundle: BundleLike, specifier: string): string | undefined {
    if (bundle.surface.mode === 'explicit') {
        return resolveExplicitPublicModuleSourceFilePath(bundle, bundle.surface, specifier);
    }
    return resolveImplicitPublicModuleSourceFilePath(bundle, bundle.surface, specifier);
}

export function buildExportsField(
    bundle: BundleLike,
    substitutionPublicModuleSourcePaths: ReadonlySet<string>
): ExportsField {
    if (bundle.surface.mode === 'explicit') {
        return buildExplicitExportsField(bundle, bundle.surface);
    }
    return buildImplicitExportsField(bundle, bundle.surface, substitutionPublicModuleSourcePaths);
}

export function buildBinField(bundle: SurfaceBundleLike): PackageJson['bin'] | undefined {
    if (bundle.surface.mode === 'explicit') {
        return buildExplicitBinField(bundle, bundle.surface);
    }
    return buildImplicitBinField(bundle);
}
