import assert from 'node:assert';
import { fake, type SinonSpy } from 'sinon';
import type { Result } from 'true-myth';
import {
    createProgressBroadcaster,
    type ProgressBroadcaster,
    type ProgressBroadcastProvider
} from '../progress/progress-broadcaster.ts';
import type { BuildReport } from '../report/aggregator/report-types.ts';

export function getErrResult<TValue, TError>(result: Result<TValue, TError>, message: string): TError {
    if (result.isErr) {
        return result.error;
    }

    assert.fail(message);
    throw new Error(message);
}

export function getOkResult<TValue, TError>(result: Result<TValue, TError>, message: string): TValue {
    if (result.isOk) {
        return result.value;
    }

    assert.fail(message);
    throw new Error(message);
}

export function toOutcome<TResult>(result: TResult): { readonly result: TResult; readonly getReport: () => undefined } {
    return {
        result,
        getReport: () => {
            return undefined;
        }
    };
}

function toOutcomeWithBuildReport<TResult>(result: TResult): {
    readonly result: TResult;
    readonly getReport: () => BuildReport;
} {
    return {
        result,
        getReport: () => {
            return {
                schemaVersion: 1,
                generatedAt: '2026-05-19T00:00:00.000Z',
                packages: {},
                aggregate: { crossBundleLinks: [] }
            };
        }
    };
}

function createReleaseOutcomeAdapter() {
    return toOutcomeWithBuildReport;
}

export const toReleaseDiffOutcome = createReleaseOutcomeAdapter();
export const toReleaseAnalysisOutcome = createReleaseOutcomeAdapter();

export const createTestProgressBroadcaster: () => ProgressBroadcaster = createProgressBroadcaster;

export type SpyingBroadcaster = {
    readonly provider: ProgressBroadcastProvider;
    readonly consumer: ReturnType<typeof createProgressBroadcaster>['consumer'];
    readonly emitSpy: SinonSpy;
};

export function createSpyingBroadcaster(): SpyingBroadcaster {
    const broadcaster = createProgressBroadcaster();
    const emitSpy = fake();
    const provider: ProgressBroadcastProvider = {
        emit: (eventName, payload): void => {
            emitSpy(eventName, payload);
            broadcaster.provider.emit(eventName, payload);
        },
        hasSubscribers: broadcaster.provider.hasSubscribers
    };
    return { provider, consumer: broadcaster.consumer, emitSpy };
}
