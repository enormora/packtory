import { match } from 'ts-pattern';
import {
    configurationErrorType,
    packPackageFailureType,
    partialFailureType,
    type PackageFileInspectionResult
} from '../../packtory/packtory-results.ts';
import type { Packtory } from '../../packtory/packtory.ts';
import {
    renderTerminalPackageFiles
} from '../../report/terminal-renderer/terminal-package-files-renderer.ts';
import type { ConfigurationLoader } from '../configuration-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { runPackageInspectionHandler } from './package-inspection-handler.ts';
import { formatTerminalErrorBullet, formatTerminalErrorTraceBullet } from './terminal-error-chain.ts';

type PackageFilesFailure = Extract<PackageFileInspectionResult, { readonly isErr: true; }>['error'];

type Logger = (message: string) => void;

type PackageFilesFlags = {
    readonly packageName: string;
    readonly trace: boolean;
};

export type PackageFilesHandlerDependencies = {
    readonly log: Logger;
    readonly packtory: Packtory;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configurationLoader: ConfigurationLoader;
    readonly flags: PackageFilesFlags;
};

function formatConfigurationFailure(
    error: Extract<PackageFilesFailure, { readonly type: typeof configurationErrorType; }>
): string {
    return [
        'Packtory files [Dry run]',
        'Configuration issues',
        ...error.issues.map(function (issue) {
            return `- ${issue}`;
        })
    ]
        .join('\n');
}

function formatPartialFailure(
    error: Extract<PackageFilesFailure, { readonly type: typeof partialFailureType; }>,
    trace: boolean
): string {
    const formatError = trace ? formatTerminalErrorTraceBullet : formatTerminalErrorBullet;
    return [
        'Packtory files [Dry run]',
        'Package failures',
        ...error.error.failures.map(formatError)
    ]
        .join('\n');
}

function formatPackageFilesFailure(error: PackageFilesFailure, trace: boolean): string {
    return match(error)
        .with({ type: configurationErrorType }, formatConfigurationFailure)
        .with({ type: partialFailureType }, function (partialFailure) {
            return formatPartialFailure(partialFailure, trace);
        })
        .with({ type: packPackageFailureType.packageNotFound }, function (notFound) {
            return `Package "${notFound.packageName}" is not declared in the packtory configuration`;
        })
        .otherwise(function () {
            return 'Package files could not be inspected';
        });
}

export async function runPackageFilesHandler(
    dependencies: PackageFilesHandlerDependencies
): Promise<number> {
    const { configurationLoader, flags, log, packtory, spinnerRenderer } = dependencies;
    return await runPackageInspectionHandler({
        log,
        spinnerRenderer,
        async inspect() {
            return await packtory.inspectPackageFiles(await configurationLoader.load(), flags.packageName);
        },
        renderFailure(error) {
            return formatPackageFilesFailure(error, flags.trace);
        },
        renderSuccess: renderTerminalPackageFiles
    });
}
