/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- shared stubs cast partial mocks of complex orchestrator types */
import { Result } from 'true-myth';
import type { DeadCodeEliminator } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { PackageProcessor } from '../packtory/package-processor.ts';
import type { ProgressBroadcaster } from '../packtory/packtory-results.ts';
import type { Scheduler as PackageScheduler } from '../packtory/scheduler.ts';

const emptyEliminatorValue = {
    async eliminate() {
        return [];
    }
};

const stubProcessorValue = {
    resolveAndLink: async () => undefined,
    build: async () => undefined,
    buildAndPublish: async () => undefined,
    tryBuildAndPublish: async () => undefined
};

const stubBroadcasterValue = {
    consumer: { on: () => undefined, off: () => undefined },
    provider: { emit: () => undefined, hasSubscribers: () => false }
};

const okSchedulerValue = {
    async runForEachScheduledPackage() {
        return Result.ok([]);
    }
};

export const emptyDeadCodeEliminator = emptyEliminatorValue as unknown as DeadCodeEliminator;
export const stubPackageProcessor = stubProcessorValue as unknown as PackageProcessor;
export const stubProgressBroadcaster = stubBroadcasterValue as unknown as ProgressBroadcaster;
export const emptyScheduler = okSchedulerValue as unknown as PackageScheduler;

export function failingScheduler(error: {
    readonly succeeded: readonly never[];
    readonly failures: readonly Error[];
}): PackageScheduler {
    const value = {
        async runForEachScheduledPackage() {
            return Result.err(error);
        }
    };
    return value as unknown as PackageScheduler;
}

export function failingDependencies(message: string): {
    readonly packageProcessor: PackageProcessor;
    readonly scheduler: PackageScheduler;
    readonly progressBroadcaster: ProgressBroadcaster;
} {
    return {
        packageProcessor: stubPackageProcessor,
        scheduler: failingScheduler({ succeeded: [], failures: [new Error(message)] }),
        progressBroadcaster: stubProgressBroadcaster
    };
}
