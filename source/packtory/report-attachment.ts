import type { PacktoryConfiguration } from '../configuration/configuration.ts';
import type { ProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { redactConfigurationForPackage } from '../report/configuration-redactor.ts';
import { createReportAggregator } from '../report/aggregator/report-aggregator.ts';
import type { BuildReport } from '../report/aggregator/report-types.ts';

export type ReportAttachment = {
    readonly getReport: () => BuildReport | undefined;
    readonly dispose: () => void;
};

export type RequiredReportAttachment = {
    readonly getReport: () => BuildReport;
    readonly dispose: () => void;
};

export function attachAggregator(progressBroadcaster: ProgressBroadcaster): RequiredReportAttachment {
    const aggregator = createReportAggregator(progressBroadcaster.consumer);
    return {
        getReport() {
            return aggregator.build();
        },
        dispose() {
            aggregator.unsubscribe();
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
    const aggregator = collectReport === true ? createReportAggregator(progressBroadcaster.consumer) : undefined;
    return {
        getReport() {
            return aggregator?.build();
        },
        dispose() {
            aggregator?.unsubscribe();
        }
    };
}
