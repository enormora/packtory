import { execFile } from 'node:child_process';
import { fileURLToPath as fileUrlToPath } from 'node:url';

type BenchmarkProcessOptions = {
    readonly worker: URL;
    readonly cwd: string;
    readonly arguments: readonly string[];
    readonly timeoutMilliseconds: number;
};

export async function executeBenchmarkProcess(options: BenchmarkProcessOptions): Promise<unknown> {
    const output = await new Promise<string>(function (resolve, reject) {
        execFile(
            process.execPath,
            [
                '--max-old-space-size=2048',
                '--experimental-strip-types',
                fileUrlToPath(options.worker),
                ...options.arguments
            ],
            { cwd: options.cwd, timeout: options.timeoutMilliseconds },
            function (error, stdout, stderr) {
                if (error === null) {
                    resolve(stdout);
                } else {
                    reject(new Error([ 'Benchmark process failed', stderr, stdout ].join('\n'), { cause: error }));
                }
            }
        );
    });
    return JSON.parse(output);
}
