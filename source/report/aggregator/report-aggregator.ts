import type { ProgressBroadcastConsumer } from '../../progress/progress-broadcaster.ts';
import { toPackageReport } from './package-report-materialization.ts';
import { registerSubscribers, type AggregatorState } from './report-event-handlers.ts';
import type { BuildReport, PackageReport } from './report-types.ts';

export type ReportAggregator = {
    readonly unsubscribe: () => void;
    readonly build: () => BuildReport;
};

function materialize(state: AggregatorState): BuildReport {
    const packageReports: Record<string, PackageReport> = {};
    for (const [ name, entry ] of state.packages) {
        packageReports[name] = toPackageReport(entry);
    }
    const generatedAt = new Date();
    return {
        schemaVersion: 1,
        generatedAt: generatedAt.toISOString(),
        packages: packageReports,
        aggregate: { crossBundleLinks: [] }
    };
}

export function createReportAggregator(consumer: ProgressBroadcastConsumer): ReportAggregator {
    const disposers: (() => void)[] = [];
    const state: AggregatorState = { packages: new Map(), disposers };
    registerSubscribers(state, consumer);
    const memo: BuildReport[] = [];
    return {
        unsubscribe() {
            for (const dispose of state.disposers) {
                dispose();
            }
        },
        build() {
            const [ cached ] = memo;
            if (cached !== undefined) {
                return cached;
            }
            const fresh = materialize(state);
            memo.push(fresh);
            return fresh;
        }
    };
}
