import { execFile as executeFile } from 'node:child_process';
import type { Readable } from 'node:stream';
import { withDeadline } from './with-deadline.ts';

type RunNodeProbeOptions = {
    readonly timeoutMilliseconds?: number;
};

type ProbeLimits = { readonly startupMilliseconds: number; readonly executionMilliseconds: number; };
type RunningNodeProbe = {
    readonly ready: Promise<void>;
    readonly result: Promise<unknown>;
    readonly stop: () => void;
};
type NodeProbeStarter = (script: string, totalMilliseconds: number) => RunningNodeProbe;

const readyMarker = '\u{1E}node-probe-ready\n';
const readinessModule = `data:text/javascript;base64,${
    Buffer.from(`process.stdout.write(${JSON.stringify(readyMarker)});`).toString('base64')
}`;

async function parseProbeOutput(standardOutput: Promise<string>): Promise<unknown> {
    const output = await standardOutput;
    if (!output.startsWith(readyMarker)) {
        throw new Error('Node probe did not signal readiness');
    }
    const parsed: unknown = JSON.parse(output.slice(readyMarker.length));
    return parsed;
}

async function waitForProbeReady(output: Readonly<Readable> | null): Promise<void> {
    if (output === null) {
        throw new Error('Node probe output is unavailable');
    }
    return new Promise<void>(function (resolve) {
        let prefix = '';
        output.on('data', function signalReadiness(chunk: Buffer | string) {
            prefix += String(chunk);
            if (prefix.startsWith(readyMarker)) {
                output.off('data', signalReadiness);
                resolve();
            }
        });
    });
}

function startNodeProbe(script: string, totalMilliseconds: number): RunningNodeProbe {
    const completed = Promise.withResolvers<string>();
    const child = executeFile(
        process.execPath,
        [
            '--experimental-strip-types',
            '--enable-source-maps',
            '--import',
            readinessModule,
            '--input-type=module',
            '-e',
            script
        ],
        { cwd: process.cwd(), encoding: 'utf8', timeout: totalMilliseconds, killSignal: 'SIGKILL' },
        function (error, standardOutput) {
            if (error instanceof Error) {
                completed.reject(error);
            } else {
                completed.resolve(standardOutput);
            }
        }
    );
    return {
        ready: waitForProbeReady(child.stdout),
        result: parseProbeOutput(completed.promise),
        stop() {
            child.kill('SIGKILL');
        }
    };
}

export function createNodeProbe(start: NodeProbeStarter): (script: string, limits: ProbeLimits) => Promise<unknown> {
    return async function (script, limits) {
        const running = start(script, limits.startupMilliseconds + limits.executionMilliseconds);
        try {
            await withDeadline(
                Promise.race([ running.ready, running.result ]),
                'Node probe startup',
                limits.startupMilliseconds
            );
            return await withDeadline(running.result, 'Node probe execution', limits.executionMilliseconds);
        } finally {
            running.stop();
        }
    };
}

const probe = createNodeProbe(startNodeProbe);

export async function runNodeProbe(script: string, options: RunNodeProbeOptions = {}): Promise<unknown> {
    return probe(script, {
        startupMilliseconds: 5000,
        executionMilliseconds: options.timeoutMilliseconds ?? 3000
    });
}

export async function observeModuleExpression(content: string, expression: string): Promise<unknown> {
    const address = `data:text/javascript;base64,${Buffer.from(content).toString('base64')}`;
    return runNodeProbe(`
        try {
            const module = await import(${JSON.stringify(address)});
            console.log(JSON.stringify({ value: ${expression} }));
        } catch (error) {
            console.log(JSON.stringify({ error: error.name }));
        }
    `);
}
