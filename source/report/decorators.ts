import type { PackageProcessor } from '../packtory/package-processor.ts';
import type { ProgressBroadcastProvider, StageName } from '../progress/progress-broadcaster.ts';

type Named = { readonly name: string };

function emitTiming(
    progressBroadcaster: ProgressBroadcastProvider,
    packageName: string,
    stage: StageName,
    start: number
): void {
    if (!progressBroadcaster.hasSubscribers('stageTimed')) {
        return;
    }
    progressBroadcaster.emit('stageTimed', {
        packageName,
        stage,
        durationMs: performance.now() - start
    });
}

export function withFailureCapture<TOptions extends Named, TResult>(
    progressBroadcaster: ProgressBroadcastProvider,
    stage: StageName,
    execute: (options: TOptions) => Promise<TResult>
): (options: TOptions) => Promise<TResult> {
    return async (options: TOptions): Promise<TResult> => {
        try {
            return await execute(options);
        } catch (error: unknown) {
            if (progressBroadcaster.hasSubscribers('packageFailed')) {
                progressBroadcaster.emit('packageFailed', {
                    packageName: options.name,
                    stage,
                    message: error instanceof Error ? error.message : String(error)
                });
            }
            throw error;
        }
    };
}

export function withStageTimings(
    processor: PackageProcessor,
    progressBroadcaster: ProgressBroadcastProvider
): PackageProcessor {
    return {
        async resolveAndLink(options) {
            const start = performance.now();
            try {
                return await processor.resolveAndLink(options);
            } finally {
                emitTiming(progressBroadcaster, options.name, 'resolveAndLink', start);
            }
        },
        async build(options) {
            const start = performance.now();
            try {
                return await processor.build(options);
            } finally {
                emitTiming(progressBroadcaster, options.name, 'build', start);
            }
        },
        async buildAndPublish(options) {
            const start = performance.now();
            try {
                return await processor.buildAndPublish(options);
            } finally {
                emitTiming(progressBroadcaster, options.buildOptions.name, 'publish', start);
            }
        },
        async tryBuildAndPublish(options) {
            const start = performance.now();
            try {
                return await processor.tryBuildAndPublish(options);
            } finally {
                emitTiming(progressBroadcaster, options.buildOptions.name, 'tryPublish', start);
            }
        }
    };
}
