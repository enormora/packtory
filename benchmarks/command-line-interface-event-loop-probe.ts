import { writeFileSync as writeFileSynchronous } from 'node:fs';
import { monitorEventLoopDelay, performance as performanceTimer } from 'node:perf_hooks';
import { setInterval as scheduleInterval, clearInterval as cancelInterval } from 'node:timers';

const histogramResolutionMilliseconds = 5;
const fineSamplerIntervalMilliseconds = 5;
const minimumReportableBlockMilliseconds = 50;
const nanosecondsPerMillisecond = 1e6;
const histogramP50 = 50;
const histogramP90 = 90;
const histogramP99 = 99;
const fixedDecimals = 2;

// eslint-disable-next-line node/no-process-env -- the probe runs in a CLI subprocess and uses an env var as its only configuration channel
const outputPath = process.env.PACKTORY_BENCH_EVENT_LOOP_PROBE_OUTPUT;

if (outputPath !== undefined && outputPath !== '') {
    const histogram = monitorEventLoopDelay({ resolution: histogramResolutionMilliseconds });
    histogram.enable();

    const blocks: { readonly atMilliseconds: number; readonly gapMilliseconds: number; }[] = [];
    let lastTickAt = performanceTimer.now();
    const fineSampler = scheduleInterval(function () {
        const now = performanceTimer.now();
        const gap = now - lastTickAt;
        if (gap > minimumReportableBlockMilliseconds) {
            blocks.push({ atMilliseconds: Math.round(now), gapMilliseconds: Math.round(gap) });
        }
        lastTickAt = now;
    }, fineSamplerIntervalMilliseconds);
    fineSampler.unref();

    process.on('exit', function () {
        cancelInterval(fineSampler);
        histogram.disable();

        const milliseconds = function (nanoseconds: number): number {
            return Number((nanoseconds / nanosecondsPerMillisecond).toFixed(fixedDecimals));
        };

        const payload = {
            histogram: {
                minimum: milliseconds(histogram.min),
                mean: milliseconds(histogram.mean),
                p50: milliseconds(histogram.percentile(histogramP50)),
                p90: milliseconds(histogram.percentile(histogramP90)),
                p99: milliseconds(histogram.percentile(histogramP99)),
                maximum: milliseconds(histogram.max)
            },
            sampledBlocks: blocks
        };
        writeFileSynchronous(outputPath, JSON.stringify(payload));
    });
}
