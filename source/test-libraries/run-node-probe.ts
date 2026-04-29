import { execFile } from 'node:child_process';

export async function runNodeProbe(script: string): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
        execFile(
            process.execPath,
            ['--input-type=module', '-e', script],
            {
                cwd: process.cwd(),
                encoding: 'utf8'
            },
            (error, standardOutput) => {
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
