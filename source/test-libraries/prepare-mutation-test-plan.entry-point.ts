import fileSystem from 'node:fs';
import { cruise } from 'dependency-cruiser';
import { z } from 'zod/mini';
import { createFileManager } from '../file-manager/file-manager.ts';

const { readFile: readTextFile, writeFile } = createFileManager({ hostFileSystem: fileSystem.promises });
const configurationContent = await readTextFile('stryker.config.json');
const configuration = z.parse(
    z.object({ mochaOptions: z.object({ config: z.string() }) }),
    JSON.parse(configurationContent)
);
const argumentStart = 2;
const [ mochaConfiguration = configuration.mochaOptions.config, destination = 'target/mutation-test-plan.json' ] =
    process.argv.slice(argumentStart);
const mochaContent = await readTextFile(mochaConfiguration);
const mocha = z.parse(
    z.object({ spec: z.array(z.string()) }),
    JSON.parse(mochaContent)
);
const files = await Array.fromAsync(fileSystem.promises.glob(mocha.spec));
const { output } = await cruise(files, {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: false,
    outputType: 'json',
    tsConfig: { fileName: 'tsconfig.json' }
});
await writeFile(destination, typeof output === 'string' ? output : JSON.stringify(output));
