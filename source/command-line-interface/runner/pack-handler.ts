import type { PackOutcome, Packtory } from '../../packtory/packtory.ts';
import type { PackFailure } from '../../packtory/packtory-results.ts';
import type { ConfigLoader } from '../config-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { getErrorSymbol, getSuccessSymbol } from './runner-symbols.ts';

type Logger = (message: string) => void;

type PackFlags = {
    readonly packageName: string;
    readonly format: 'folder' | 'tar' | 'zip';
    readonly outputPath: string;
    readonly version: string;
    readonly vendorDependencies: boolean;
};

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

function formatPartialResolveFailure(error: PackFailure & { readonly type: 'partial' }): string {
    const messages = error.error.failures.map((failure) => {
        return `- ${failure.message}`;
    });
    return [`${getErrorSymbol()} ${messages.length} package(s) failed to resolve`, ...messages].join('\n');
}

function formatPeerFailure(error: PackFailure & { readonly type: 'peer-dependencies-unsatisfied' }): string {
    const lines = error.items.map((item) => {
        return `- "${item.packageName}" needs peer "${item.peer}"`;
    });
    const count = error.items.length;
    const header = `${getErrorSymbol()} Pack of "${error.packageName}" is missing ${count} peer dependency(ies)`;
    return [header, ...lines].join('\n');
}

function formatBundleDepFailure(packageName: string): string {
    const note = 'declares bundleDependencies which pack does not yet support without --vendor-dependencies';
    return `${getErrorSymbol()} Package "${packageName}" ${note}`;
}

function formatPackageNotFound(packageName: string): string {
    return `${getErrorSymbol()} Package "${packageName}" is not declared in the packtory configuration`;
}

type ConfigOrCheckError = PackFailure & { readonly type: 'checks' | 'config' };
type PackPackageError = PackFailure & {
    readonly type: 'bundle-dependencies-unsupported' | 'package-not-found' | 'peer-dependencies-unsatisfied';
};

function formatIssueListFailure(error: ConfigOrCheckError): string {
    if (error.type === 'config') {
        return formatIssueList('The provided config is invalid', error.issues);
    }
    return formatIssueList('Checks failed', error.issues);
}

function formatPackPackageFailure(error: PackPackageError): string {
    if (error.type === 'package-not-found') {
        return formatPackageNotFound(error.packageName);
    }
    if (error.type === 'bundle-dependencies-unsupported') {
        return formatBundleDepFailure(error.packageName);
    }
    return formatPeerFailure(error);
}

function isConfigOrCheckError(error: PackFailure): error is ConfigOrCheckError {
    return error.type === 'config' || error.type === 'checks';
}

function isPackPackageError(error: PackFailure): error is PackPackageError {
    return (
        error.type === 'package-not-found' ||
        error.type === 'bundle-dependencies-unsupported' ||
        error.type === 'peer-dependencies-unsatisfied'
    );
}

function formatPackFailure(error: PackFailure): string {
    if (isConfigOrCheckError(error)) {
        return formatIssueListFailure(error);
    }
    if (isPackPackageError(error)) {
        return formatPackPackageFailure(error);
    }
    return formatPartialResolveFailure(error);
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
