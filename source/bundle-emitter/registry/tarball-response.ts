export const maximumDownloadedTarballBytes = 268_435_456;

function assertDownloadedTarballSize(size: number, maximumBytes: number): void {
    if (size > maximumBytes) {
        throw new Error(`Refusing to download tarball larger than ${maximumBytes} bytes`);
    }
}

async function assertDeclaredTarballSize(response: Response, maximumBytes: number): Promise<void> {
    try {
        assertDownloadedTarballSize(Number(response.headers.get('content-length')), maximumBytes);
    } catch (error) {
        await response.body?.cancel();
        throw error;
    }
}

export async function readTarballResponse(response: Response, maximumBytes: number): Promise<Buffer> {
    await assertDeclaredTarballSize(response, maximumBytes);
    const chunks: Uint8Array[] = [];
    let downloadedBytes = 0;
    if (response.body !== null) {
        for await (const chunk of response.body) {
            downloadedBytes += chunk.byteLength;
            assertDownloadedTarballSize(downloadedBytes, maximumBytes);
            chunks.push(chunk);
        }
    }
    return Buffer.concat(chunks, downloadedBytes);
}
