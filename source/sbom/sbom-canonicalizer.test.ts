import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createFileDescription } from '../file-manager/file-description.ts';
import { buildSbomFixtureContent } from '../test-libraries/sbom-fixtures.ts';
import { canonicalizeSbomInFileSet } from './sbom-canonicalizer.ts';

function canonicalize(content: string): string {
    const [file] = canonicalizeSbomInFileSet([createFileDescription('sbom.cdx.json', content)]);
    assert.ok(file);
    return file.content;
}

function firstToolComponentOf(content: string): Record<string, unknown> {
    const parsed = JSON.parse(canonicalize(content)) as {
        metadata: { tools: { components: readonly Record<string, unknown>[] } };
    };
    const [entry] = parsed.metadata.tools.components;
    assert.ok(entry);
    return entry;
}

suite('sbom-canonicalizer', function () {
    suite('SBOM content rewriting', function () {
        test('removes the version field from the packtory tool entry', function () {
            const entry = firstToolComponentOf(buildSbomFixtureContent({ packtoryVersion: '1.2.3' }));
            assert.strictEqual(entry.name, 'packtory');
            assert.strictEqual('version' in entry, false);
        });

        test('produces byte-identical output for inputs that differ only in the packtory version', function () {
            const first = canonicalize(buildSbomFixtureContent({ packtoryVersion: '1.2.3' }));
            const second = canonicalize(buildSbomFixtureContent({ packtoryVersion: '9.9.9' }));
            assert.strictEqual(first, second);
        });

        test('preserves the version field on non-packtory tool entries', function () {
            const input = JSON.stringify({
                metadata: { tools: { components: [{ name: 'some-other-tool', version: '4.5.6' }] } }
            });
            const entry = firstToolComponentOf(input);
            assert.strictEqual(entry.version, '4.5.6');
        });

        test('only strips the packtory entry when packtory and another tool coexist', function () {
            const input = JSON.stringify({
                metadata: {
                    tools: {
                        components: [
                            { name: 'packtory', version: '1.2.3' },
                            { name: 'some-other-tool', version: '4.5.6' }
                        ]
                    }
                }
            });
            const parsed = JSON.parse(canonicalize(input)) as {
                metadata: { tools: { components: readonly Record<string, unknown>[] } };
            };
            const byName = new Map(
                parsed.metadata.tools.components.map((entry) => {
                    return [entry.name as string, entry];
                })
            );
            const packtoryEntry = byName.get('packtory');
            const otherEntry = byName.get('some-other-tool');
            assert.ok(packtoryEntry);
            assert.ok(otherEntry);
            assert.strictEqual('version' in packtoryEntry, false);
            assert.strictEqual(otherEntry.version, '4.5.6');
        });

        test('produces byte-identical output for two SBOMs that differ only in object key order', function () {
            assert.strictEqual(canonicalize('{"a":1,"b":2}'), canonicalize('{"b":2,"a":1}'));
        });

        test('returns the input verbatim when the content is not valid JSON', function () {
            const malformed = '{not valid json';
            assert.strictEqual(canonicalize(malformed), malformed);
        });

        test('passes through when metadata is missing entirely', function () {
            const input = JSON.stringify({ bomFormat: 'CycloneDX' });
            assert.deepStrictEqual(JSON.parse(canonicalize(input)), { bomFormat: 'CycloneDX' });
        });

        test('passes through when metadata.tools is missing', function () {
            const input = JSON.stringify({ metadata: { component: { name: 'foo' } } });
            assert.deepStrictEqual(JSON.parse(canonicalize(input)), { metadata: { component: { name: 'foo' } } });
        });

        test('passes through when metadata.tools.components is missing', function () {
            const input = JSON.stringify({ metadata: { tools: { services: [] } } });
            assert.deepStrictEqual(JSON.parse(canonicalize(input)), { metadata: { tools: { services: [] } } });
        });

        test('passes through legacy metadata.tools array shape without crashing', function () {
            const input = JSON.stringify({ metadata: { tools: [{ name: 'packtory', version: '1.2.3' }] } });
            const parsed = JSON.parse(canonicalize(input)) as {
                metadata: { tools: readonly Record<string, unknown>[] };
            };
            const [entry] = parsed.metadata.tools;
            assert.ok(entry);
            assert.strictEqual(entry.version, '1.2.3');
        });

        test('ignores non-object entries inside the components array', function () {
            const input = JSON.stringify({
                metadata: { tools: { components: ['not-an-object', { name: 'packtory', version: '1.2.3' }] } }
            });
            const parsed = JSON.parse(canonicalize(input)) as {
                metadata: { tools: { components: readonly unknown[] } };
            };
            const packtoryEntry = parsed.metadata.tools.components.find((entry): entry is Record<string, unknown> => {
                return (
                    typeof entry === 'object' &&
                    entry !== null &&
                    (entry as Record<string, unknown>).name === 'packtory'
                );
            });
            assert.ok(packtoryEntry);
            assert.strictEqual('version' in packtoryEntry, false);
        });

        test('leaves the packtory entry untouched when it already has no version', function () {
            const input = JSON.stringify({
                metadata: { tools: { components: [{ name: 'packtory' }] } }
            });
            const parsed = JSON.parse(canonicalize(input)) as {
                metadata: { tools: { components: readonly Record<string, unknown>[] } };
            };
            assert.deepStrictEqual(parsed.metadata.tools.components, [{ name: 'packtory' }]);
        });
    });

    suite('file-set rewriting', function () {
        test('preserves filePath and isExecutable on the canonicalized SBOM entry', function () {
            const sbom = createFileDescription('sbom.cdx.json', buildSbomFixtureContent(), true);
            const [result] = canonicalizeSbomInFileSet([sbom]);
            assert.ok(result);
            assert.strictEqual(result.filePath, 'sbom.cdx.json');
            assert.strictEqual(result.isExecutable, true);
        });

        test('does not modify entries whose path is not sbom.cdx.json', function () {
            const other = createFileDescription('package.json', buildSbomFixtureContent());
            const [result] = canonicalizeSbomInFileSet([other]);
            assert.strictEqual(result, other);
        });

        test('passes through file sets that do not contain an SBOM', function () {
            const files = [createFileDescription('readme.md', '# hello'), createFileDescription('package.json', '{}')];
            const result = canonicalizeSbomInFileSet(files);
            assert.deepStrictEqual(result, files);
        });

        test('only canonicalizes the SBOM in a mixed file set', function () {
            const readme = createFileDescription('readme.md', '# hello');
            const sbom = createFileDescription('sbom.cdx.json', buildSbomFixtureContent());
            const [first, second] = canonicalizeSbomInFileSet([readme, sbom]);
            assert.strictEqual(first, readme);
            assert.ok(second);
            assert.notStrictEqual(second.content, sbom.content);
        });

        test('returns an empty array for an empty input', function () {
            assert.deepStrictEqual(canonicalizeSbomInFileSet([]), []);
        });
    });
});
