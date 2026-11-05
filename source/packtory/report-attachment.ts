import type { PacktoryConfiguration } from '../configuration/configuration.ts';
import type { ProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { redactConfigurationForPackage } from '../report/configuration-redactor.ts';
import { createReportAggregator } from '../report/aggregator/report-aggregator.ts';
import type { BuildReport } from '../report/aggregator/report-types.ts';

export type ReportAttachment = {
    readonly getReport: () => BuildReport | undefined;
    readonly run: <T>(operation: () => Promise<T> | T) => Promise<T>;
};

export type RequiredReportAttachment = {
    readonly getReport: () => BuildReport;
    readonly run: <T>(operation: () => Promise<T> | T) => Promise<T>;
};

export function attachAggregator(progressBroadcaster: ProgressBroadcaster): RequiredReportAttachment {
    const aggregator = createReportAggregator();
    return {
        getReport() {
            return aggregator.build();
        },
        async run(operation) {
            return progressBroadcaster.observe(aggregator.provider, operation);
        }
    };
}

export function emitEffectiveConfigurationPerPackage(
    progressBroadcaster: ProgressBroadcaster,
    packtoryConfiguration: PacktoryConfiguration
): void {
    if (!progressBroadcaster.provider.hasSubscribers('effectiveConfigurationResolved')) {
        return;
    }
    for (const packageConfiguration of packtoryConfiguration.packages) {
        progressBroadcaster.provider.emit('effectiveConfigurationResolved', {
            packageName: packageConfiguration.name,
            configuration: redactConfigurationForPackage(packtoryConfiguration, packageConfiguration.name)
        });
    }
}

export function maybeAttachAggregator(
    progressBroadcaster: ProgressBroadcaster,
    collectReport: boolean | undefined
): ReportAttachment {
    const aggregator = collectReport === true ? createReportAggregator() : undefined;
    return {
        getReport() {
            return aggregator?.build();
        },
        async run(operation) {
            return aggregator === undefined ? operation() : progressBroadcaster.observe(aggregator.provider, operation);
        }
    };
}
