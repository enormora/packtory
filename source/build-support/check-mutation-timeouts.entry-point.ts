import { runMutationTimeoutCheck } from './check-mutation-timeouts.ts';

process.exitCode = await runMutationTimeoutCheck(process.argv);
