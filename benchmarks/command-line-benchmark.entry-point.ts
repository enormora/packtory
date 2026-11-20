import {
    createCommandLineInterface
} from '../source/packages/command-line-interface/command-line-interface.composition.ts';

async function importModule(modulePath: string): Promise<unknown> {
    return import(modulePath);
}

const microsecondsPerMillisecond = 1000;
const commandLineInterface = createCommandLineInterface(importModule);
const initialCpuUsage = process.cpuUsage();
try {
    await commandLineInterface.run();
} catch (error: unknown) {
    await commandLineInterface.fail(error);
}
const commandCpuUsage = process.cpuUsage(initialCpuUsage);
process.stderr.write(
    `${
        JSON.stringify({
            workMilliseconds: (commandCpuUsage.user + commandCpuUsage.system) / microsecondsPerMillisecond
        })
    }\n`
);
