import { match } from 'ts-pattern';
import type { Result } from 'true-myth';
import {
    configurationErrorType,
    partialFailureType,
    packPackageFailureType,
    type PackageInspectionFailure
} from '../../packtory/packtory-results.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { formatTerminalErrorBullet, formatTerminalErrorTraceBullet } from './terminal-error-chain.ts';

type InspectionOutcome<TInspection, TFailure> = {
    readonly result: Result<TInspection, TFailure>;
};

export type PackageInspectionHandlerInput<TInspection, TFailure> = {
    readonly inspect: () => Promise<InspectionOutcome<TInspection, TFailure>>;
    readonly renderFailure: (error: TFailure) => string;
    readonly renderSuccess: (inspection: TInspection) => string;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly log: (message: string) => void;
};

function renderInspectionOutcome<TInspection, TFailure>(
    input: PackageInspectionHandlerInput<TInspection, TFailure>,
    outcome: InspectionOutcome<TInspection, TFailure>
): number {
    if (outcome.result.isErr) {
        input.log(input.renderFailure(outcome.result.error));
        return 1;
    }

    input.log(input.renderSuccess(outcome.result.value).trimEnd());
    return 0;
}

async function inspectPackage<TInspection, TFailure>(
    input: PackageInspectionHandlerInput<TInspection, TFailure>
): Promise<number> {
    const outcome = await input.inspect();
    input.spinnerRenderer.stopAll();
    return renderInspectionOutcome(input, outcome);
}

export async function runPackageInspectionHandler<TInspection, TFailure>(
    input: PackageInspectionHandlerInput<TInspection, TFailure>
): Promise<number> {
    try {
        return await inspectPackage(input);
    } finally {
        input.spinnerRenderer.stopAll();
    }
}

type PackageInspectionFailureInput = {
    readonly error: PackageInspectionFailure;
    readonly title: string;
    readonly fallback: string;
    readonly trace: boolean;
};

export function formatPackageInspectionFailure(input: PackageInspectionFailureInput): string {
    const { error, title, fallback, trace } = input;
    const formatError = trace ? formatTerminalErrorTraceBullet : formatTerminalErrorBullet;
    return match(error)
        .with({ type: configurationErrorType }, function (configuration) {
            return [
                title,
                'Configuration issues',
                ...configuration.issues.map(function (issue) {
                    return `- ${issue}`;
                })
            ]
                .join('\n');
        })
        .with({ type: partialFailureType }, function (partial) {
            return [ title, 'Package failures', ...partial.error.failures.map(formatError) ].join('\n');
        })
        .with({ type: packPackageFailureType.packageNotFound }, function (notFound) {
            return `Package "${notFound.packageName}" is not declared in the packtory configuration`;
        })
        .otherwise(function () {
            return fallback;
        });
}
