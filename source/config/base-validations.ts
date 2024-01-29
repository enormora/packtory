import { string, nonEmpty } from '@effect/schema/Schema';

export const nonEmptyStringSchema = string.pipe(nonEmpty());

export type NoExpand<T> = T & { readonly _?: never };
