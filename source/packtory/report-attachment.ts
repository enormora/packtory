import type { PacktoryConfig } from '../config/config.ts';
import type { ProgressBroadcaster } from '../progress/progress-broadcaster.ts';
import { redactConfigForPackage } from '../report/config-redactor.ts';
import { createReportAggregator } from '../report/report-aggregator.ts';
import type { BuildReport } from '../report/types.ts';

export type ReportAttachment = {
    readonly getReport: () => BuildReport | undefined;
    readonly dispose: () => void;
};

const noReport = (): undefined => {
    return undefined;
};

const noDispose = (): void => {
    return undefined;
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
    if (collectReport !== true) {
        return { getReport: noReport, dispose: noDispose };
    }
    const aggregator = createReportAggregator(progressBroadcaster.consumer);
    return {
        getReport: () => {
            return aggregator.build();
        },
        dispose: () => {
            aggregator.unsubscribe();
        }
    };
}
