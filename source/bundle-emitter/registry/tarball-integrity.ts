import ssri from 'ssri';

export type TarballIntegrity = {
    readonly integrity: string | undefined;
    readonly shasum: string | undefined;
};

const sha1HexPattern = /^[a-f0-9]{40}$/u;

function assertIntegrityMetadataMatches(tarball: Buffer, integrity: string): void {
    try {
        ssri.checkData(tarball, integrity, { strict: true, error: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Downloaded tarball failed dist.integrity verification: ${message}`, { cause: error });
    }
}

function assertShasumMetadataMatches(tarball: Buffer, shasum: string): void {
    if (!sha1HexPattern.test(shasum)) {
        throw new Error(`Registry returned invalid dist.shasum "${shasum}"`);
    }

    try {
        ssri.checkData(tarball, ssri.fromHex(shasum, 'sha1'), { error: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Downloaded tarball failed dist.shasum verification: ${message}`, { cause: error });
    }
}

export function assertTarballIntegrity(tarball: Buffer, tarballIntegrity: TarballIntegrity): void {
    if (tarballIntegrity.integrity !== undefined) {
        assertIntegrityMetadataMatches(tarball, tarballIntegrity.integrity);
    }

    if (tarballIntegrity.shasum !== undefined) {
        assertShasumMetadataMatches(tarball, tarballIntegrity.shasum);
    }
}
