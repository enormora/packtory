import { match } from 'ts-pattern';
import {
    configErrorType,
    packPackageFailureType,
    partialFailureType,
    type PackageSideEffectsInspectionFailure
} from '../../packtory/packtory-results.ts';
import type { Packtory } from '../../packtory/packtory.ts';
import {
    renderTerminalPackageSideEffects
} from '../../report/terminal-renderer/terminal-package-side-effects-renderer.ts';
import type { ConfigLoader } from '../config-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { runPackageInspectionHandler } from './package-inspection-handler.ts';
import { formatTerminalErrorBullet, formatTerminalErrorTraceBullet } from './terminal-error-chain.ts';

type Logger = (message: string) => void;

type PackageSideEffectsFlags = {
    readonly packageName: string;
    readonly trace: boolean;
};

export type PackageSideEffectsHandlerDependencies = {
    readonly log: Logger;
    readonly packtory: Packtory;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
    readonly flags: PackageSideEffectsFlags;
};

function formatConfigFailure(
    error: Extract<PackageSideEffectsInspectionFailure, { readonly type: typeof configErrorType; }>
): string {
    return [
        'Packtory side effects [Dry run]',
        'Configuration issues',
        ...error.issues.map(function (issue) {
            return `- ${issue}`;
        })
    ]
        .join('\n');
}

function formatPartialFailure(
    error: Extract<PackageSideEffectsInspectionFailure, { readonly type: typeof partialFailureType; }>,
    trace: boolean
): string {
    const formatError = trace ? formatTerminalErrorTraceBullet : formatTerminalErrorBullet;
    return [
        'Packtory side effects [Dry run]',
        'Package failures',
        ...error.error.failures.map(formatError)
    ]
        .join('\n');
}

function formatPackageSideEffectsFailure(error: PackageSideEffectsInspectionFailure, trace: boolean): string {
    return match(error)
        .with({ type: configErrorType }, formatConfigFailure)
        .with({ type: partialFailureType }, function (partialFailure) {
            return formatPartialFailure(partialFailure, trace);
        })
        .with({ type: packPackageFailureType.packageNotFound }, function (notFound) {
            return `Package "${notFound.packageName}" is not declared in the packtory configuration`;
        })
        .otherwise(function () {
            return 'Package side effects could not be inspected';
        });
}

export async function runPackageSideEffectsHandler(
    dependencies: PackageSideEffectsHandlerDependencies
): Promise<number> {
    const { configLoader, flags, log, packtory, spinnerRenderer } = dependencies;
    return await runPackageInspectionHandler({
        log,
        spinnerRenderer,
        async inspect() {
            return await packtory.inspectPackageSideEffects(await configLoader.load(), flags.packageName);
        },
        renderFailure(error) {
            return formatPackageSideEffectsFailure(error, flags.trace);
        },
        renderSuccess: renderTerminalPackageSideEffects
    });
}
