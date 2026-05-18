import { z } from 'zod/mini';

const packageVersionDetailsSchema = z.object({
    dist: z.object({
        tarball: z.string()
    })
});

const abbreviatedPackageResponseSchema = z.object({
    name: z.string(),
    'dist-tags': z.object({
        latest: z.optional(z.string())
    }),
    versions: z.record(z.string(), packageVersionDetailsSchema)
});

const oidcExchangeResponseSchema = z.object({
    token_type: z.string(),
    token: z.string(),
    created: z.string(),
    expires: z.string()
});

export type AbbreviatedPackageResponse = {
    readonly name: string;
    readonly 'dist-tags': {
        readonly latest?: string | undefined;
    };
    readonly versions: Readonly<Record<string, { readonly dist: { readonly tarball: string } }>>;
};

export type OidcExchangeResponse = {
    readonly token_type: string;
    readonly token: string;
    readonly created: string;
    readonly expires: string;
};

export function parseAbbreviatedPackageResponse(response: unknown): AbbreviatedPackageResponse | undefined {
    const result = abbreviatedPackageResponseSchema.safeParse(response);
    return result.success ? result.data : undefined;
}

export function parseOidcExchangeResponse(response: unknown): OidcExchangeResponse | undefined {
    const result = oidcExchangeResponseSchema.safeParse(response);
    return result.success ? result.data : undefined;
}
