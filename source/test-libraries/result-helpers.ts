import assert from 'node:assert';
import { fake, type SinonSpy } from 'sinon';
import type { Result } from 'true-myth';
import {
    createProgressBroadcaster,
    type ProgressBroadcaster,
    type ProgressBroadcastProvider
} from '../progress/progress-broadcaster.ts';
import type { BuildReport } from '../report/aggregator/report-types.ts';

type Outcome<TResult> = {
    readonly result: TResult;
    readonly getReport: () => undefined;
};

type BuildReportOutcome<TResult> = {
    readonly result: TResult;
    readonly getReport: () => BuildReport;
};

type ReleaseOutcomeAdapter = <TResult>(result: TResult) => BuildReportOutcome<TResult>;

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

export function toOutcome<TResult>(result: TResult): Outcome<TResult> {
    return {
        result,
        getReport() {
            return undefined;
        }
    };
}

function toOutcomeWithBuildReport<TResult>(result: TResult): BuildReportOutcome<TResult> {
    return {
        result,
        getReport() {
            return {
                schemaVersion: 1,
                generatedAt: '2026-05-19T00:00:00.000Z',
                packages: {},
                aggregate: { crossBundleLinks: [] }
            };
        }
    };
}

function createReleaseOutcomeAdapter(): ReleaseOutcomeAdapter {
    return toOutcomeWithBuildReport;
}

export const toReleaseDiffOutcome = createReleaseOutcomeAdapter();
export const toReleaseAnalysisOutcome = createReleaseOutcomeAdapter();

export const createTestProgressBroadcaster: () => ProgressBroadcaster = createProgressBroadcaster;
export type TestProgressBroadcaster = ProgressBroadcaster;

export type SpyingBroadcaster = {
    readonly provider: ProgressBroadcastProvider;
    readonly consumer: ProgressBroadcaster['consumer'];
    readonly emitSpy: SinonSpy;
};

export function createSpyingBroadcaster(): SpyingBroadcaster {
    const broadcaster = createProgressBroadcaster();
    const emitSpy = fake();
    const provider: ProgressBroadcastProvider = {
        emit(eventName, payload): void {
            emitSpy(eventName, payload);
            broadcaster.provider.emit(eventName, payload);
        },
        hasSubscribers: broadcaster.provider.hasSubscribers
    };
    return { provider, consumer: broadcaster.consumer, emitSpy };
}
