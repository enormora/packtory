import { Result } from 'true-myth';
import type { Scheduler as PackageScheduler } from '../packtory/scheduler.ts';

type IterateParams = {
    readonly config: IteratingSchedulerConfig;
    readonly createOptions: (context: unknown) => unknown;
    readonly execute: (options: unknown) => Promise<unknown>;
    readonly selectNext: (params: SelectNextInput) => unknown;
    readonly createProgressEvent?: (params: ProgressEventInput) => unknown;
};

type IteratingSchedulerConfig = {
    readonly packtoryConfig: { readonly packages: readonly { readonly name: string; }[]; };
};

type SelectNextInput = {
    readonly result: unknown;
    readonly options: unknown;
};

type ProgressEventInput = SelectNextInput & {
    readonly packageName: string;
};

type CaptureSink = {
    readonly push: (value: unknown) => unknown;
};

export type IteratingSchedulerCapture = {
    readonly events: CaptureSink;
    readonly selected: CaptureSink;
    readonly emitScheduledEvents?: boolean | undefined;
};

type IterateRunParams = IterateParams & { readonly emitScheduledEvents?: boolean; };

function createUnknownList(): unknown[] {
    return [];
}

function createErrorList(): Error[] {
    return [];
}

function recordCapturedSelection(
    capture: Readonly<IteratingSchedulerCapture> | undefined,
    selected: unknown
): void {
    if (capture !== undefined) {
        capture.selected.push(selected);
    }
}

function recordCapturedEvent(capture: Readonly<IteratingSchedulerCapture> | undefined, event: unknown): void {
    if (event !== undefined && capture !== undefined) {
        capture.events.push(event);
    }
}

export function createIteratingScheduler(
    packageNames: readonly string[],
    capture?: IteratingSchedulerCapture
): PackageScheduler {
    const value = {
        async runForEachScheduledPackage(params: IterateRunParams) {
            const state = {
                existing: createUnknownList(),
                failures: createErrorList(),
                results: createUnknownList()
            };
            if (capture !== undefined) {
                Object.assign(capture, { emitScheduledEvents: params.emitScheduledEvents });
            }
            function recordPackageSuccess(packageName: string, options: unknown, result: unknown): void {
                state.results.push(result);
                const selected = params.selectNext({ result, options });
                state.existing.push(selected);
                recordCapturedSelection(capture, selected);
                const event = params.createProgressEvent?.({ packageName, result, options });
                recordCapturedEvent(capture, event);
            }
            const runPackage = async function (packageName: string): Promise<void> {
                const options = params.createOptions({ packageName, existing: state.existing, config: params.config });
                try {
                    const result = await params.execute(options);
                    recordPackageSuccess(packageName, options, result);
                } catch (error) {
                    state.failures.push(error as Error);
                }
            };
            for (const packageName of packageNames) {
                await runPackage(packageName);
            }
            if (state.failures.length > 0) {
                return Result.err({ succeeded: state.results, failures: state.failures });
            }
            return Result.ok(state.results);
        }
    };
    return value as unknown as PackageScheduler;
}
