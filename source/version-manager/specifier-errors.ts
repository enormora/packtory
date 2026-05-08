import type { MutableNpaType } from './specifier-classifier.ts';

export type MutableOffender = {
    readonly name: string;
    readonly specifier: string;
    readonly npaType: MutableNpaType;
};

export type MalformedOffender = {
    readonly name: string;
    readonly specifier: string;
    readonly reason: string;
};

function dependencyWord(count: number): string {
    return count === 1 ? 'dependency' : 'dependencies';
}

function entryWord(count: number): string {
    return count === 1 ? 'entry' : 'entries';
}

export function renderMutableSpecifierMessage(offenders: readonly MutableOffender[]): string {
    const isSingular = offenders.length === 1;
    const verbAndNoun = isSingular ? 'uses a mutable specifier' : 'use mutable specifiers';
    const bypassVerb = isSingular ? 'bypasses' : 'bypass';
    const noun = dependencyWord(offenders.length);
    const header =
        `Refusing to publish: ${offenders.length} ${noun} ${verbAndNoun},` +
        ` which ${bypassVerb} the npm registry's integrity guarantees:`;
    const lines = offenders.map((offender) => {
        return `  - "${offender.name}" → "${offender.specifier}" (${offender.npaType})`;
    });
    const footer = 'Add the dep name to dependencyPolicy.allowMutableSpecifiers to allow this on purpose.';
    return [header, ...lines, footer].join('\n');
}

export function renderMalformedSpecifierMessage(offenders: readonly MalformedOffender[]): string {
    const isSingular = offenders.length === 1;
    const verb = isSingular ? 'has' : 'have';
    const noun = dependencyWord(offenders.length);
    const header = `Refusing to publish: ${offenders.length} ${noun} ${verb} a specifier that npm cannot publish:`;
    const lines = offenders.map((offender) => {
        return `  - "${offender.name}" → "${offender.specifier}" (${offender.reason})`;
    });
    const replacementHint = 'Replace with a registry version (e.g. "^1.2.3").';
    const allowListHint = 'Mutable-specifier allow-listing does not apply here.';
    return [header, ...lines, `${replacementHint} ${allowListHint}`].join('\n');
}

export function renderUnusedAllowListMessage(unusedEntries: readonly string[]): string {
    const isSingular = unusedEntries.length === 1;
    const verb = isSingular ? 'is' : 'are';
    const noun = entryWord(unusedEntries.length);
    const header =
        `Refusing to publish: ${unusedEntries.length} ${noun} in` +
        ` dependencyPolicy.allowMutableSpecifiers ${verb} not in use:`;
    const lines = unusedEntries.map((entry) => {
        return `  - "${entry}"`;
    });
    const footer = 'Remove unused entries — they reflect stale exceptions to the integrity policy.';
    return [header, ...lines, footer].join('\n');
}
