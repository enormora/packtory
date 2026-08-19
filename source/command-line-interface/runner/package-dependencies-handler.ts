import {
    configErrorType,
    packPackageFailureType,
    partialFailureType,
    type PackageDependencyInspectionFailure
} from '../../packtory/packtory-results.ts';
import type { Packtory } from '../../packtory/packtory.ts';
import {
    renderTerminalPackageDependencies
} from '../../report/terminal-renderer/terminal-package-dependencies-renderer.ts';
import type { ConfigLoader } from '../config-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { formatTerminalErrorBullet, formatTerminalErrorTraceBullet } from './terminal-error-chain.ts';

type Logger = (message: string) => void;

type PackageDependenciesFlags = {
    readonly packageName: string;
    readonly trace: boolean;
};

export type PackageDependenciesHandlerDependencies = {
    readonly log: Logger;
    readonly packtory: Packtory;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
    readonly flags: PackageDependenciesFlags;
};

function formatConfigFailure(
    error: Extract<PackageDependencyInspectionFailure, { readonly type: typeof configErrorType; }>
): string {
    return [
        'Packtory dependency reasons [Dry run]',
        'Configuration issues',
        ...error.issues.map(function (issue) {
            return `- ${issue}`;
        })
    ]
        .join('\n');
}

function formatPartialFailure(
    error: Extract<PackageDependencyInspectionFailure, { readonly type: typeof partialFailureType; }>,
    trace: boolean
): string {
    const formatError = trace ? formatTerminalErrorTraceBullet : formatTerminalErrorBullet;
    return [
        'Packtory dependency reasons [Dry run]',
        'Package failures',
        ...error.error.failures.map(formatError)
    ]
        .join('\n');
}

function formatPackageDependenciesFailure(error: PackageDependencyInspectionFailure, trace: boolean): string {
    if (error.type === configErrorType) {
        return formatConfigFailure(error);
    }

    if (error.type === partialFailureType) {
        return formatPartialFailure(error, trace);
    }

    if (error.type === packPackageFailureType.packageNotFound) {
        return `Package "${error.packageName}" is not declared in the packtory configuration`;
    }

    return 'Package dependencies could not be inspected';
}

async function inspectPackageDependencies(dependencies: PackageDependenciesHandlerDependencies): Promise<number> {
    const { configLoader, flags, log, packtory, spinnerRenderer } = dependencies;
    const outcome = await packtory.inspectPackageDependencies(await configLoader.load(), flags.packageName);
    spinnerRenderer.stopAll();

    if (outcome.result.isErr) {
        log(formatPackageDependenciesFailure(outcome.result.error, flags.trace));
        return 1;
    }

    log(renderTerminalPackageDependencies(outcome.result.value).trimEnd());
    return 0;
}

export async function runPackageDependenciesHandler(
    dependencies: PackageDependenciesHandlerDependencies
): Promise<number> {
    try {
        return await inspectPackageDependencies(dependencies);
    } finally {
        dependencies.spinnerRenderer.stopAll();
    }
}
