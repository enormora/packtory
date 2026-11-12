import { createHash } from 'node:crypto';
import { serialize } from 'node:v8';

export function contentDigest(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}

export function valueFingerprint(value: unknown): string {
    return createHash('sha256').update(serialize(value)).digest('hex');
}
