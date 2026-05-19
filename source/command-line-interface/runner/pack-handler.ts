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

function formatPackFailure(error: PackFailure): string {
    if (error.type === 'config') {
        return formatIssueList('The provided config is invalid', error.issues);
    }
    if (error.type === 'checks') {
        return formatIssueList('Checks failed', error.issues);
    }
    if (error.type === 'package-not-found') {
        return `${getErrorSymbol()} Package "${error.packageName}" is not declared in the packtory configuration`;
    }
    if (error.type === 'bundle-dependencies-unsupported') {
        const note = 'declares bundleDependencies which pack does not yet support without --vendor-dependencies';
        return `${getErrorSymbol()} Package "${error.packageName}" ${note}`;
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
