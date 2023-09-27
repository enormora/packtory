import path from 'node:path';
import fs from 'node:fs/promises';
import type { PackageJson } from 'type-fest';
import { publisher } from './publisher.entry-point.js';

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
        ) as PackageJson,
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
