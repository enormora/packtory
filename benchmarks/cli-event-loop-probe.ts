import { writeFileSync } from 'node:fs';
import { monitorEventLoopDelay, performance as performanceTimer } from 'node:perf_hooks';
import { setInterval as scheduleInterval, clearInterval as cancelInterval } from 'node:timers';

const histogramResolutionMs = 5;
const fineSamplerIntervalMs = 5;
const minimumReportableBlockMs = 50;
const nanosecondsPerMillisecond = 1e6;
const histogramP50 = 50;
const histogramP90 = 90;
const histogramP99 = 99;
const fixedDecimals = 2;

// eslint-disable-next-line node/no-process-env -- the probe runs in a CLI subprocess and uses an env var as its only configuration channel
const outputPath = process.env.PACKTORY_BENCH_EVENT_LOOP_PROBE_OUTPUT;

if (outputPath !== undefined && outputPath !== '') {
    const histogram = monitorEventLoopDelay({ resolution: histogramResolutionMs });
    histogram.enable();

    const blocks: { readonly atMs: number; readonly gapMs: number; }[] = [];
    let lastTickAt = performanceTimer.now();
    const fineSampler = scheduleInterval(function () {
        const now = performanceTimer.now();
        const gap = now - lastTickAt;
        if (gap > minimumReportableBlockMs) {
            blocks.push({ atMs: Math.round(now), gapMs: Math.round(gap) });
        }
        lastTickAt = now;
    }, fineSamplerIntervalMs);
    fineSampler.unref();

    process.on('exit', function () {
        cancelInterval(fineSampler);
        histogram.disable();

        const ms = function (nanoseconds: number): number {
            return Number((nanoseconds / nanosecondsPerMillisecond).toFixed(fixedDecimals));
        };

        const payload = {
            histogram: {
                min: ms(histogram.min),
                mean: ms(histogram.mean),
                p50: ms(histogram.percentile(histogramP50)),
                p90: ms(histogram.percentile(histogramP90)),
                p99: ms(histogram.percentile(histogramP99)),
                max: ms(histogram.max)
            },
            sampledBlocks: blocks
        };

        // eslint-disable-next-line node/no-sync -- exit handlers must be synchronous
        writeFileSync(outputPath, JSON.stringify(payload));
    });
}
