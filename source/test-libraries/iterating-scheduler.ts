/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- shared test helper casts a partial mock of a complex orchestrator type */
import { Result } from 'true-myth';
import type { Scheduler as PackageScheduler } from '../packtory/scheduler.ts';

type IterateParams = {
    readonly config: { readonly packtoryConfig: { readonly packages: readonly { readonly name: string }[] } };
    readonly createOptions: (context: unknown) => unknown;
    readonly execute: (options: unknown) => Promise<unknown>;
    readonly selectNext: (params: { readonly result: unknown; readonly options: unknown }) => unknown;
    readonly createProgressEvent?: (params: {
        readonly packageName: string;
        readonly result: unknown;
        readonly options: unknown;
    }) => unknown;
};

export type IteratingSchedulerCapture = {
    readonly events: unknown[];
    readonly selected: unknown[];
};

export function createIteratingScheduler(
    packageNames: readonly string[],
    capture?: IteratingSchedulerCapture
): PackageScheduler {
    const value = {
        async runForEachScheduledPackage(params: IterateParams) {
            const results: unknown[] = [];
            const failures: Error[] = [];
            const existing: unknown[] = [];
            for (const packageName of packageNames) {
                const options = params.createOptions({ packageName, existing, config: params.config });
                try {
                    const result = await params.execute(options);
                    results.push(result);
                    const selected = params.selectNext({ result, options });
                    existing.push(selected);
                    capture?.selected.push(selected);
                    const event = params.createProgressEvent?.({ packageName, result, options });
                    if (event !== undefined) {
                        capture?.events.push(event);
                    }
                } catch (error) {
                    failures.push(error as Error);
                }
            }
            if (failures.length > 0) {
                return Result.err({ succeeded: results, failures });
            }
            return Result.ok(results);
        }
    };
    return value as unknown as PackageScheduler;
}
