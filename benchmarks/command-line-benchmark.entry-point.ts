import {
    runCommandLineInterface,
    failCommandLineInterface
} from '../source/packages/command-line-interface/command-line-interface.composition.ts';

const started = performance.now();
try {
    await runCommandLineInterface();
} catch (error: unknown) {
    await failCommandLineInterface(error);
}
process.stderr.write(`${JSON.stringify({ workMilliseconds: performance.now() - started })}\n`);
