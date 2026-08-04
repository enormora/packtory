import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { suite, test } from 'mocha';
import { assertTarballIntegrity } from './tarball-integrity.ts';

function toIntegrity(content: Buffer): string {
    return `sha512-${createHash('sha512').update(content).digest('base64')}`;
}

const tarball = Buffer.from('tarball-bytes');
const otherTarball = Buffer.from('other-tarball-bytes');
const matchingIntegrity = toIntegrity(tarball);
const mismatchingIntegrity = toIntegrity(otherTarball);
const matchingShasum = [ '9ef2570c89e65b9f', 'e47687b0b49e122e', '59354bef' ].join('');
const mismatchingShasum = [ 'db59fc5197d8bb60', 'c796f8fc7ac7da62', 'e1f8b38c' ].join('');
const emptyTarballIntegrity = { integrity: undefined, shasum: undefined } as const;
const legacyIntegrity = `sha1-${Buffer.from(matchingShasum, 'hex').toString('base64')}`;

function assertThrowsWithCause(action: () => void, messagePattern: RegExp, causePattern: RegExp): void {
    try {
        action();
        assert.fail('Expected action to throw');
    } catch (error: unknown) {
        assert.ok(error instanceof Error);
        assert.match(error.message, messagePattern);
        assert.ok(error.cause instanceof Error);
        assert.match(error.cause.message, causePattern);
    }
}

suite('tarball-integrity', function () {
    suite('accepted metadata', function () {
        test('accepts tarballs when the registry provides no digest metadata', function () {
            assertTarballIntegrity(tarball, emptyTarballIntegrity);
        });

        test('accepts tarballs that match dist.integrity', function () {
            assertTarballIntegrity(tarball, { integrity: matchingIntegrity, shasum: undefined });
        });

        test('accepts tarballs that match dist.shasum', function () {
            assertTarballIntegrity(tarball, { integrity: undefined, shasum: matchingShasum });
        });

        test('accepts tarballs that match both digest metadata fields', function () {
            assertTarballIntegrity(tarball, { integrity: matchingIntegrity, shasum: matchingShasum });
        });

        test('accepts standard SRI multi-hash metadata when the strongest digest matches', function () {
            const integrity = [
                `sha256-${createHash('sha256').update(otherTarball).digest('base64')}`,
                matchingIntegrity
            ]
                .join(' ');

            assertTarballIntegrity(tarball, { integrity, shasum: undefined });
        });
    });

    suite('rejected metadata', function () {
        test('rejects tarballs that fail dist.integrity verification', function () {
            assertThrowsWithCause(
                function () {
                    assertTarballIntegrity(tarball, { integrity: mismatchingIntegrity, shasum: undefined });
                },
                /^Downloaded tarball failed dist\.integrity verification:/u,
                /Integrity checksum failed/u
            );
        });

        test('rejects malformed dist.integrity metadata', function () {
            assertThrowsWithCause(
                function () {
                    assertTarballIntegrity(tarball, { integrity: 'sha512-not-base64', shasum: undefined });
                },
                /^Downloaded tarball failed dist\.integrity verification:/u,
                /No valid integrity hashes/u
            );
        });

        test('rejects legacy digest algorithms in dist.integrity metadata', function () {
            assertThrowsWithCause(
                function () {
                    assertTarballIntegrity(tarball, { integrity: legacyIntegrity, shasum: undefined });
                },
                /^Downloaded tarball failed dist\.integrity verification:/u,
                /No valid integrity hashes/u
            );
        });

        test('rejects tarballs that fail dist.shasum verification', function () {
            assertThrowsWithCause(
                function () {
                    assertTarballIntegrity(tarball, { integrity: undefined, shasum: mismatchingShasum });
                },
                /^Downloaded tarball failed dist\.shasum verification:/u,
                /Integrity checksum failed/u
            );
        });

        test('rejects malformed dist.shasum metadata', function () {
            assert.throws(function () {
                assertTarballIntegrity(tarball, { integrity: undefined, shasum: 'not-a-shasum' });
            }, /^Error: Registry returned invalid dist\.shasum "not-a-shasum"$/u);
        });

        test('rejects when dist.integrity matches but dist.shasum does not', function () {
            assert.throws(function () {
                assertTarballIntegrity(tarball, { integrity: matchingIntegrity, shasum: mismatchingShasum });
            }, /^Error: Downloaded tarball failed dist\.shasum verification:/u);
        });
    });
});
