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
    async resolveAndLink() {
        return undefined;
    },
    async build() {
        return undefined;
    },
    async buildAndPublish() {
        return undefined;
    },
    async tryBuildAndPublish() {
        return undefined;
    }
};

const stubBroadcasterValue = {
    consumer: {
        on() {
            return undefined;
        },
        off() {
            return undefined;
        }
    },
    provider: {
        emit() {
            return undefined;
        },
        hasSubscribers() {
            return false;
        }
    }
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

type FailingSchedulerError = {
    readonly succeeded: readonly never[];
    readonly failures: readonly Error[];
};

type FailingDependencies = {
    readonly packageProcessor: PackageProcessor;
    readonly scheduler: PackageScheduler;
    readonly progressBroadcaster: ProgressBroadcaster;
    readonly repositoryFolder: string;
};

export function failingScheduler(error: FailingSchedulerError): PackageScheduler {
    const value = {
        async runForEachScheduledPackage() {
            return Result.err(error);
        }
    };
    return value;
}

export function failingDependencies(message: string): FailingDependencies {
    return {
        packageProcessor: stubPackageProcessor,
        scheduler: failingScheduler({ succeeded: [], failures: [ new Error(message) ] }),
        progressBroadcaster: stubProgressBroadcaster,
        repositoryFolder: '/'
    };
}
