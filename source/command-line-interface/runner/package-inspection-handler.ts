import type { Result } from 'true-myth';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';

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
