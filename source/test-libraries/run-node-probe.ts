import { execFile as executeFile } from 'node:child_process';

type RunNodeProbeOptions = {
    readonly timeoutMilliseconds?: number;
};

const defaultTimeoutMilliseconds = 3000;

export async function runNodeProbe(script: string, options: RunNodeProbeOptions = {}): Promise<unknown> {
    return new Promise<unknown>(function (resolve, reject) {
        executeFile(
            process.execPath,
            [ '--experimental-strip-types', '--enable-source-maps', '--input-type=module', '-e', script ],
            {
                cwd: process.cwd(),
                encoding: 'utf8',
                timeout: options.timeoutMilliseconds ?? defaultTimeoutMilliseconds
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
