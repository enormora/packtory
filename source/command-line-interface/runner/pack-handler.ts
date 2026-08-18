import { match } from 'ts-pattern';
import type { PackOutcome, Packtory } from '../../packtory/packtory.ts';
import {
    checksErrorType,
    configErrorType,
    packPackageFailureType,
    partialFailureType,
    type PackFailure
} from '../../packtory/packtory-results.ts';
import type { ConfigLoader } from '../config-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { getErrorSymbol, getSuccessSymbol } from './runner-symbols.ts';
import { formatTerminalErrorBullet, formatTerminalErrorTraceBullet } from './terminal-error-chain.ts';

type Logger = (message: string) => void;
const issuePrefixByType = {
    [configErrorType]: 'The provided config is invalid',
    [checksErrorType]: 'Checks failed'
} as const;

type PackFlags = {
    readonly all: boolean;
    readonly packageName: string | undefined;
    readonly format: 'folder' | 'tar' | 'zip';
    readonly outputPath: string;
    readonly version: string;
    readonly vendorDependencies: boolean;
    readonly trace: boolean;
};
type PartialPackFailure = Extract<PackFailure, { readonly type: typeof partialFailureType; }>;
type PeerDependenciesUnsatisfiedPackFailure = Extract<
    PackFailure,
    { readonly type: typeof packPackageFailureType.peerDependenciesUnsatisfied; }
>;
type VendorSymlinkOutsidePackagePackFailure = Extract<
    PackFailure,
    { readonly type: typeof packPackageFailureType.vendorSymlinkTargetOutsidePackage; }
>;
type VendorInvalidDependencyNamePackFailure = Extract<
    PackFailure,
    { readonly type: typeof packPackageFailureType.vendorInvalidDependencyName; }
>;
type BundleDependenciesUnsupportedPackFailure = Extract<
    PackFailure,
    { readonly type: typeof packPackageFailureType.bundleDependenciesUnsupported; }
>;
type PackageNotFoundPackFailure = Extract<
    PackFailure,
    { readonly type: typeof packPackageFailureType.packageNotFound; }
>;
type PackageNamePackFailure = BundleDependenciesUnsupportedPackFailure | PackageNotFoundPackFailure;
type OutputPathPackFailures = readonly [
    Extract<PackFailure, { readonly type: typeof packPackageFailureType.outputFolderExists; }>,
    Extract<PackFailure, { readonly type: typeof packPackageFailureType.outputRootNotDirectory; }>,
    Extract<PackFailure, { readonly type: typeof packPackageFailureType.unsafeOutputFolder; }>
];
type OutputPathPackFailure = OutputPathPackFailures[number];
type IssuePackFailure = Extract<
    PackFailure,
    {
        readonly type: typeof checksErrorType | typeof configErrorType;
    }
>;

export type PackHandlerDependencies = {
    readonly log: Logger;
    readonly packtory: Packtory;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
    readonly flags: PackFlags;
};

type PackModeRule = {
    readonly invalid: (flags: PackFlags) => boolean;
    readonly message: string;
};
type AllPackMode = { readonly type: 'all'; };
type InvalidPackMode = { readonly message: string; readonly type: 'invalid'; };
type SinglePackMode = { readonly packageName: string; readonly type: 'single'; };
type PackMode = AllPackMode | InvalidPackMode | SinglePackMode;

const packModeRules: readonly PackModeRule[] = [
    {
        invalid(flags) {
            return flags.all && flags.packageName !== undefined;
        },
        message: 'Pass either --all or <package>, not both'
    },
    {
        invalid(flags) {
            return flags.all && flags.format !== 'folder';
        },
        message: 'pack --all only supports --format folder'
    }
];

function formatIssueList(prefix: string, issues: readonly string[]): string {
    const issueCount = `${issues.length} issue(s)`;
    return `${getErrorSymbol()} ${prefix}, there are ${issueCount}\n\n- ${issues.join('\n- ')}`;
}

function formatBulletedLines(header: string, details: readonly string[]): string {
    return [ header, ...details ].join('\n');
}

function formatPartialResolveFailure(error: PartialPackFailure, trace: boolean): string {
    return formatBulletedLines(
        `${getErrorSymbol()} ${error.error.failures.length} package(s) failed to resolve`,
        error.error.failures.map(trace ? formatTerminalErrorTraceBullet : formatTerminalErrorBullet)
    );
}

function formatPeerFailure(error: PeerDependenciesUnsatisfiedPackFailure): string {
    return formatBulletedLines(
        `${getErrorSymbol()} Pack of "${error.packageName}" is missing ${error.items.length} peer dependency(ies)`,
        error.items.map(function (item) {
            return `- "${item.packageName}" needs peer "${item.peer}"`;
        })
    );
}

const packageFailureSuffixByType = {
    [packPackageFailureType.bundleDependenciesUnsupported]:
        'declares bundleDependencies which pack does not yet support without --vendor-dependencies',
    [packPackageFailureType.packageNotFound]: 'is not declared in the packtory configuration'
} as const;

function formatInvalidPackMode(message: string): string {
    return `${getErrorSymbol()} ${message}`;
}

function formatOutputPathFailure(error: OutputPathPackFailure): string {
    if (error.type === packPackageFailureType.outputRootNotDirectory) {
        return `${getErrorSymbol()} Pack output root "${error.outputPath}" exists but is not a directory`;
    }
    if (error.type === packPackageFailureType.unsafeOutputFolder) {
        return `${getErrorSymbol()} Package "${error.packageName}" cannot be packed safely to "${error.outputPath}"`;
    }
    return `${getErrorSymbol()} Pack output folder "${error.outputPath}" for "${error.packageName}" already exists`;
}

function formatVendorSymlinkOutsidePackageFailure(
    error: VendorSymlinkOutsidePackagePackFailure
): string {
    const reason = 'rejected a vendored dependency with a symlink that escapes its package directory';
    const header = `${getErrorSymbol()} Pack of "${error.packageName}" ${reason}`;
    const target = `which resolves to "${error.resolvedTargetPath}"`;
    const details = `- "${error.vendoredPackageName}" contains "${error.entryRelativePath}" ${target}`;
    return `${header}\n${details}`;
}

function formatVendorInvalidDependencyNameFailure(
    error: VendorInvalidDependencyNamePackFailure
): string {
    const reason = 'rejected a vendored package.json with an invalid dependency name';
    const header = `${getErrorSymbol()} Pack of "${error.packageName}" ${reason}`;
    const sourceLabel = error.sourcePackageName === undefined
        ? 'the configured external set'
        : `"${error.sourcePackageName}"`;
    const tail = 'which is not a valid npm package name';
    const details = `- ${sourceLabel} declares dependency "${error.invalidDependencyName}" ${tail}`;
    return `${header}\n${details}`;
}

function formatPackageNameFailure(error: PackageNamePackFailure): string {
    return `${getErrorSymbol()} Package "${error.packageName}" ${packageFailureSuffixByType[error.type]}`;
}

function isIssueFailure(error: PackFailure): error is IssuePackFailure {
    return error.type === configErrorType || error.type === checksErrorType;
}

function formatPackageFailure(error: Exclude<PackFailure, IssuePackFailure | PartialPackFailure>): string {
    return match(error)
        .with({ type: packPackageFailureType.bundleDependenciesUnsupported }, formatPackageNameFailure)
        .with({ type: packPackageFailureType.packageNotFound }, formatPackageNameFailure)
        .with({ type: packPackageFailureType.outputFolderExists }, formatOutputPathFailure)
        .with({ type: packPackageFailureType.outputRootNotDirectory }, formatOutputPathFailure)
        .with({ type: packPackageFailureType.unsafeOutputFolder }, formatOutputPathFailure)
        .with({ type: packPackageFailureType.peerDependenciesUnsatisfied }, formatPeerFailure)
        .with({ type: packPackageFailureType.vendorInvalidDependencyName }, formatVendorInvalidDependencyNameFailure)
        .otherwise(formatVendorSymlinkOutsidePackageFailure);
}

function formatPackFailure(error: PackFailure, trace: boolean): string {
    if (isIssueFailure(error)) {
        return formatIssueList(issuePrefixByType[error.type], error.issues);
    }

    if (error.type === partialFailureType) {
        return formatPartialResolveFailure(error, trace);
    }

    return formatPackageFailure(error);
}

function reportOutcome(log: Logger, outcome: PackOutcome, flags: PackFlags, packageName: string): number {
    if (outcome.result.isErr) {
        log(formatPackFailure(outcome.result.error, flags.trace));
        return 1;
    }
    log(`${getSuccessSymbol()} Packed "${packageName}" as ${flags.format} to ${flags.outputPath}`);
    return 0;
}

function reportAllOutcome(
    log: Logger,
    outcome: Awaited<ReturnType<Packtory['packAllPackages']>>,
    flags: PackFlags
): number {
    if (outcome.result.isErr) {
        log(formatPackFailure(outcome.result.error, flags.trace));
        return 1;
    }
    const packageCount = String(outcome.result.value.packageNames.length);
    log(`${getSuccessSymbol()} Packed ${packageCount} packages as folders to ${flags.outputPath}`);
    return 0;
}

function packMode(flags: PackFlags): PackMode {
    const rule = packModeRules.find(function (candidate) {
        return candidate.invalid(flags);
    });
    if (rule !== undefined) {
        return { type: 'invalid', message: rule.message };
    }

    if (flags.all) {
        return { type: 'all' };
    }

    if (flags.packageName === undefined) {
        return { type: 'invalid', message: 'Pass <package> or --all' };
    }

    return { type: 'single', packageName: flags.packageName };
}

async function runPackAll(dependencies: PackHandlerDependencies, config: unknown): Promise<number> {
    const { log, packtory, flags } = dependencies;
    const outcome = await packtory.packAllPackages(config, {
        outputPath: flags.outputPath,
        version: flags.version,
        vendorDependencies: flags.vendorDependencies
    });
    return reportAllOutcome(log, outcome, flags);
}

async function runSinglePack(
    dependencies: PackHandlerDependencies,
    config: unknown,
    packageName: string
): Promise<number> {
    const { log, packtory, flags } = dependencies;
    const outcome = await packtory.packPackage(config, {
        packageName,
        format: flags.format,
        outputPath: flags.outputPath,
        version: flags.version,
        vendorDependencies: flags.vendorDependencies
    });
    return reportOutcome(log, outcome, flags, packageName);
}

async function runConfiguredPackAll(dependencies: PackHandlerDependencies): Promise<number> {
    const { configLoader } = dependencies;
    const config = await configLoader.load();

    return await runPackAll(dependencies, config);
}

async function runConfiguredSinglePack(
    dependencies: PackHandlerDependencies,
    packageName: string
): Promise<number> {
    const config = await dependencies.configLoader.load();

    return await runSinglePack(dependencies, config, packageName);
}

async function runConfiguredPack(
    dependencies: PackHandlerDependencies,
    mode: Exclude<PackMode, { readonly type: 'invalid'; }>
): Promise<number> {
    if (mode.type === 'single') {
        return await runConfiguredSinglePack(dependencies, mode.packageName);
    }

    return await runConfiguredPackAll(dependencies);
}

export async function runPackHandler(dependencies: PackHandlerDependencies): Promise<number> {
    const { flags, log, spinnerRenderer } = dependencies;
    const mode = packMode(flags);
    if (mode.type === 'invalid') {
        log(formatInvalidPackMode(mode.message));
        return 1;
    }

    try {
        return await runConfiguredPack(dependencies, mode);
    } finally {
        spinnerRenderer.stopAll();
    }
}
