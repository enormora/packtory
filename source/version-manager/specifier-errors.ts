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

function renderLines<T>(items: readonly T[], renderItem: (item: T) => string): readonly string[] {
    return items.map(renderItem);
}

export function renderMutableSpecifierMessage(offenders: readonly MutableOffender[]): string {
    const isSingular = offenders.length === 1;
    const verbAndNoun = isSingular ? 'uses a mutable specifier' : 'use mutable specifiers';
    const bypassVerb = isSingular ? 'bypasses' : 'bypass';
    const noun = dependencyWord(offenders.length);
    const header = `Refusing to publish: ${offenders.length} ${noun} ${verbAndNoun},` +
        ` which ${bypassVerb} the npm registry's integrity guarantees:`;
    const lines = [
        header,
        ...renderLines(offenders, function (offender) {
            return `  - "${offender.name}" → "${offender.specifier}" (${offender.npaType})`;
        })
    ];
    const footer = 'Add the dep name to dependencyPolicy.allowMutableSpecifiers to allow this on purpose.';
    lines.push(footer);
    return lines.join('\n');
}

export function renderMalformedSpecifierMessage(offenders: readonly MalformedOffender[]): string {
    const isSingular = offenders.length === 1;
    const verb = isSingular ? 'has' : 'have';
    const noun = dependencyWord(offenders.length);
    const header = `Refusing to publish: ${offenders.length} ${noun} ${verb} a specifier that npm cannot publish:`;
    const lines = [
        header,
        ...renderLines(offenders, function (offender) {
            return `  - "${offender.name}" → "${offender.specifier}" (${offender.reason})`;
        })
    ];
    const replacementHint = 'Replace with a registry version (e.g. "^1.2.3").';
    const allowListHint = 'Mutable-specifier allow-listing does not apply here.';
    lines.push(`${replacementHint} ${allowListHint}`);
    return lines.join('\n');
}

export function renderUnusedAllowListMessage(unusedEntries: readonly string[]): string {
    const isSingular = unusedEntries.length === 1;
    const verb = isSingular ? 'is' : 'are';
    const noun = entryWord(unusedEntries.length);
    const header = `Refusing to publish: ${unusedEntries.length} ${noun} in` +
        ` dependencyPolicy.allowMutableSpecifiers ${verb} not in use:`;
    const lines = [
        header,
        ...renderLines(unusedEntries, function (entry) {
            return `  - "${entry}"`;
        })
    ];
    const footer = 'Remove unused entries — they reflect stale exceptions to the integrity policy.';
    lines.push(footer);
    return lines.join('\n');
}
