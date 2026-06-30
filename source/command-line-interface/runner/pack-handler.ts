import type { PackOutcome, Packtory } from '../../packtory/packtory.ts';
import { partialFailureMessages } from '../../packtory/partial-result.ts';
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

type Logger = (message: string) => void;
const issuePrefixByType = {
    [configErrorType]: 'The provided config is invalid',
    [checksErrorType]: 'Checks failed'
} as const;

type PackFlags = {
    readonly packageName: string;
    readonly format: 'folder' | 'tar' | 'zip';
    readonly outputPath: string;
    readonly version: string;
    readonly vendorDependencies: boolean;
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
type IssuePackFailure = Extract<
    PackFailure,
    {
        readonly type: typeof checksErrorType | typeof configErrorType;
    }
>;

export type PackHandlerDeps = {
    readonly log: Logger;
    readonly packtory: Packtory;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
    readonly flags: PackFlags;
};

function formatIssueList(prefix: string, issues: readonly string[]): string {
    const issueCount = `${issues.length} issue(s)`;
    return `${getErrorSymbol()} ${prefix}, there are ${issueCount}\n\n- ${issues.join('\n- ')}`;
}

function formatBulletedLines(header: string, details: readonly string[]): string {
    return [ header, ...details ].join('\n');
}

function formatPartialResolveFailure(error: PartialPackFailure): string {
    return formatBulletedLines(
        `${getErrorSymbol()} ${error.error.failures.length} package(s) failed to resolve`,
        partialFailureMessages(error.error).map(function (message) {
            return `- ${message}`;
        })
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

function isPackageNameFailure(error: PackFailure): error is PackageNamePackFailure {
    return (
        error.type === packPackageFailureType.bundleDependenciesUnsupported ||
        error.type === packPackageFailureType.packageNotFound
    );
}

function formatNonIssuePackFailure(
    error: Exclude<PackFailure, { readonly type: typeof checksErrorType | typeof configErrorType; }>
): string {
    if (error.type === partialFailureType) {
        return formatPartialResolveFailure(error);
    }

    if (isPackageNameFailure(error)) {
        return formatPackageNameFailure(error);
    }

    if (error.type === packPackageFailureType.peerDependenciesUnsatisfied) {
        return formatPeerFailure(error);
    }

    if (error.type === packPackageFailureType.vendorInvalidDependencyName) {
        return formatVendorInvalidDependencyNameFailure(error);
    }

    return formatVendorSymlinkOutsidePackageFailure(error);
}

function formatPackFailure(error: PackFailure): string {
    if (isIssueFailure(error)) {
        return formatIssueList(issuePrefixByType[error.type], error.issues);
    }

    return formatNonIssuePackFailure(error);
}

function reportOutcome(log: Logger, outcome: PackOutcome, flags: PackFlags): number {
    if (outcome.result.isErr) {
        log(formatPackFailure(outcome.result.error));
        return 1;
    }
    log(`${getSuccessSymbol()} Packed "${flags.packageName}" as ${flags.format} to ${flags.outputPath}`);
    return 0;
}

export async function runPackHandler(deps: PackHandlerDeps): Promise<number> {
    const { log, packtory, spinnerRenderer, configLoader, flags } = deps;
    try {
        const outcome = await packtory.packPackage(await configLoader.load(), {
            packageName: flags.packageName,
            format: flags.format,
            outputPath: flags.outputPath,
            version: flags.version,
            vendorDependencies: flags.vendorDependencies
        });
        spinnerRenderer.stopAll();
        return reportOutcome(log, outcome, flags);
    } finally {
        spinnerRenderer.stopAll();
    }
}
