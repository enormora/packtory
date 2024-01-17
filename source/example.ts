import path from 'node:path';
import fs from 'node:fs/promises';
import { publisher } from './publisher.entry-point.js';
import type { MainPackageJson } from './config/package-json.js';

const sourcesFolder = path.join(process.cwd(), 'target/build/source');

async function main(): Promise<void> {
    const result = await publisher.tryBuildAndPublish({
        name: '@enormora/publishing-automation-test-package',
        versioning: {
            automatic: true
        },
        sourcesFolder,
        entryPoints: [{ js: path.join(sourcesFolder, 'hello-world.entry-point.js') }],
        mainPackageJson: JSON.parse(
            await fs.readFile(path.join(process.cwd(), 'package.json'), { encoding: 'utf8' })
        ) as MainPackageJson,
        registrySettings: {
            token: 'the-token'
        }
    });

    console.log(result.status, result.bundle.packageJson.version);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
