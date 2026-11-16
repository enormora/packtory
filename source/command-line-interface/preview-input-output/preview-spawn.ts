import type { SpawnFunction } from './preview-process.ts';

export async function spawnForCompletion(
    spawnProcess: SpawnFunction,
    command: string,
    commandArguments: readonly string[],
    content: string
): Promise<boolean> {
    return new Promise<boolean>(function (resolve) {
        const child = spawnProcess(command, commandArguments, { stdio: [ 'pipe', 'inherit', 'inherit' ] });
        if (child.standardInput === null) {
            resolve(false);
            return;
        }
        child.on('error', function () {
            resolve(false);
        });
        child.on('close', function (code) {
            resolve(code === 0);
        });
        child.standardInput.on('error', function () {
            resolve(false);
        });
        child.standardInput.end(content);
    });
}
