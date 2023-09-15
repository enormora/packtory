import {publisher} from './publisher.entry-point.js';
import path from 'path';
import fs from 'fs';

const sourcesFolder = path.join(process.cwd(), 'target/build/source');

async function main() {
    const result = await publisher.tryBuildAndPublish({
        name: 'foo',
        versioning: {
            automatic: false,
            version: '1.2.3'
        },
        sourcesFolder,
        entryPoints: [ {js: path.join(sourcesFolder, 'bundler.entry-point.js')} ],
        mainPackageJson: JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), {encoding: 'utf8'}))
    });

    console.log(result.type, result.manifest);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
