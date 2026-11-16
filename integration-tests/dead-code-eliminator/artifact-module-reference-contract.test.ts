import assert from 'node:assert';
import fileSystem from 'node:fs';
import path from 'node:path';
import { suite, test } from 'mocha';

async function productionFilesIn(folder: string): Promise<readonly string[]> {
    const names = await fileSystem.promises.readdir(folder);
    return names
        .filter(function (name) {
            return name.endsWith('.ts') && !name.endsWith('.test.ts');
        })
        .map(function (name) {
            return path.join(folder, name);
        });
}

suite('artifact module reference contract', function () {
    test('reachability walkers do not resolve module specifiers with path operations', async function () {
        const files = [
            ...await productionFilesIn('source/dead-code-eliminator/reachability'),
            ...await productionFilesIn('source/dead-code-eliminator/cross-bundle')
        ];
        const offenders: string[] = [];
        for (const filePath of files) {
            const content = await fileSystem.promises.readFile(filePath, 'utf8');
            if (/from ['"]node:path['"]|path\.(?:join|resolve|dirname)|\bdirname\(/u.test(content)) {
                offenders.push(filePath);
            }
        }
        assert.deepStrictEqual(offenders, []);
    });
});
