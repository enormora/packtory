import {
    createCommandLineInterface
} from '../source/packages/command-line-interface/command-line-interface.composition.ts';

async function importModule(modulePath: string): Promise<unknown> {
    return import(modulePath);
}

const commandLineInterface = createCommandLineInterface(importModule);
const started = performance.now();
try {
    await commandLineInterface.run();
} catch (error: unknown) {
    await commandLineInterface.fail(error);
}
process.stderr.write(`${JSON.stringify({ workMilliseconds: performance.now() - started })}\n`);
