import type { PacktoryConfig } from '../config/config.ts';
import type { ProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { redactConfigForPackage } from '../report/config-redactor.ts';
import { createReportAggregator, type BuildReport } from '../report/report-aggregator.ts';

export type ReportAttachment = {
    readonly getReport: () => BuildReport | undefined;
    readonly dispose: () => void;
};

export function emitEffectiveConfigPerPackage(
    progressBroadcaster: ProgressBroadcaster,
    packtoryConfig: PacktoryConfig
): void {
    if (!progressBroadcaster.provider.hasSubscribers('effectiveConfigResolved')) {
        return;
    }
    for (const packageConfig of packtoryConfig.packages) {
        progressBroadcaster.provider.emit('effectiveConfigResolved', {
            packageName: packageConfig.name,
            config: redactConfigForPackage(packtoryConfig, packageConfig.name)
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
