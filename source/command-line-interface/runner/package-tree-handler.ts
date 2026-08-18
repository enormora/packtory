import {
    checksErrorType,
    configErrorType,
    packPackageFailureType,
    partialFailureType,
    type PackageTreeFailure
} from '../../packtory/packtory-results.ts';
import type { Packtory } from '../../packtory/packtory.ts';
import { renderTerminalPackageTree } from '../../report/terminal-renderer/terminal-package-tree-renderer.ts';
import type { ConfigLoader } from '../config-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { formatTerminalErrorBullet, formatTerminalErrorTraceBullet } from './terminal-error-chain.ts';

type Logger = (message: string) => void;

type PackageTreeFlags = {
    readonly packageName: string;
    readonly trace: boolean;
};
type CheckPackageTreeFailure = Extract<PackageTreeFailure, { readonly type: typeof checksErrorType; }>;
type ConfigPackageTreeFailure = Extract<PackageTreeFailure, { readonly type: typeof configErrorType; }>;
type IssuePackageTreeFailure = CheckPackageTreeFailure | ConfigPackageTreeFailure;
type NamedPackageTreeFailure = Extract<PackageTreeFailure, { readonly packageName: string; }>;

export type PackageTreeHandlerDependencies = {
    readonly log: Logger;
    readonly packtory: Packtory;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
    readonly flags: PackageTreeFlags;
};

const issueTitleByType = {
    [configErrorType]: 'Configuration issues',
    [checksErrorType]: 'Check failures'
} as const;

function formatIssueFailure(error: IssuePackageTreeFailure): string {
    return [
        'Packtory tree [Dry run]',
        issueTitleByType[error.type],
        ...error.issues.map(function (issue) {
            return `- ${issue}`;
        })
    ]
        .join('\n');
}

function formatPackageNotFoundFailure(
    error: Extract<PackageTreeFailure, { readonly type: typeof packPackageFailureType.packageNotFound; }>
): string {
    return `Package "${error.packageName}" is not declared in the packtory configuration`;
}

function formatPartialFailure(
    error: Extract<PackageTreeFailure, { readonly type: typeof partialFailureType; }>,
    trace: boolean
): string {
    const formatError = trace ? formatTerminalErrorTraceBullet : formatTerminalErrorBullet;
    return [
        'Packtory tree [Dry run]',
        'Package failures',
        ...error.error.failures.map(formatError)
    ]
        .join('\n');
}

function hasPackageName(error: PackageTreeFailure): error is NamedPackageTreeFailure {
    return Object.hasOwn(error, 'packageName');
}

function formatPackageTreeFailure(error: PackageTreeFailure, trace: boolean): string {
    if (error.type === configErrorType || error.type === checksErrorType) {
        return formatIssueFailure(error);
    }

    if (error.type === partialFailureType) {
        return formatPartialFailure(error, trace);
    }

    if (error.type === packPackageFailureType.packageNotFound) {
        return formatPackageNotFoundFailure(error);
    }

    if (hasPackageName(error)) {
        return `Package "${error.packageName}" could not be inspected`;
    }

    return 'Package could not be inspected';
}

async function inspectPackageTree(dependencies: PackageTreeHandlerDependencies): Promise<number> {
    const { configLoader, flags, log, packtory, spinnerRenderer } = dependencies;
    const outcome = await packtory.inspectPackageTree(await configLoader.load(), flags.packageName);
    spinnerRenderer.stopAll();

    if (outcome.result.isErr) {
        log(formatPackageTreeFailure(outcome.result.error, flags.trace));
        return 1;
    }

    log(renderTerminalPackageTree(outcome.result.value).trimEnd());
    return 0;
}

export async function runPackageTreeHandler(dependencies: PackageTreeHandlerDependencies): Promise<number> {
    try {
        return await inspectPackageTree(dependencies);
    } finally {
        dependencies.spinnerRenderer.stopAll();
    }
}
