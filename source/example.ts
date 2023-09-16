import {publisher} from './publisher.entry-point.js';
import path from 'path';
import fs from 'fs';

const sourcesFolder = path.join(process.cwd(), 'target/build/source');

async function main() {
    const result = await publisher.tryBuildAndPublish({
        name: '@enormora/publishing-automation-test-package',
        versioning: {
            automatic: true,
        },
        sourcesFolder,
        entryPoints: [ {js: path.join(sourcesFolder, 'hello-world.entry-point.js')} ],
        mainPackageJson: JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), {encoding: 'utf8'})),
        registrySettings: {
            token: 'the-token'
        }
    });

    console.log(result.status, result.version);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
