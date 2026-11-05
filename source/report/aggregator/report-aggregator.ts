import type { ProgressBroadcastProvider } from '../../progress/progress-broadcaster.ts';
import { toPackageReport } from './package-report-materialization.ts';
import { createReportEventHandlers, type AggregatorState } from './report-event-handlers.ts';
import type { BuildReport, PackageReport } from './report-types.ts';

export type ReportAggregator = {
    readonly provider: ProgressBroadcastProvider;
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

export function createReportAggregator(): ReportAggregator {
    const state: AggregatorState = { packages: new Map() };
    const provider = createReportEventHandlers(state);
    const memo: BuildReport[] = [];
    return {
        provider,
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
