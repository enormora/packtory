import { execFile } from 'node:child_process';

type RunNodeProbeOptions = {
    readonly timeoutMs?: number;
};

const defaultTimeoutMs = 3000;

export async function runNodeProbe(script: string, options: RunNodeProbeOptions = {}): Promise<unknown> {
    return new Promise<unknown>(function (resolve, reject) {
        execFile(
            process.execPath,
            [ '--experimental-strip-types', '--enable-source-maps', '--input-type=module', '-e', script ],
            {
                cwd: process.cwd(),
                encoding: 'utf8',
                timeout: options.timeoutMs ?? defaultTimeoutMs
            },
            function (error, standardOutput) {
                if (error instanceof Error) {
                    reject(error);
                    return;
                }

                try {
                    const parsed: unknown = JSON.parse(standardOutput);
                    resolve(parsed);
                } catch (parseError: unknown) {
                    reject(parseError instanceof Error ? parseError : new Error(String(parseError)));
                }
            }
        );
    });
}
