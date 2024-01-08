export function capitalize(value: string): string {
    const firstLetterCodePoint = value.codePointAt(0);
    const firstLetter = firstLetterCodePoint === undefined ? '' : String.fromCodePoint(firstLetterCodePoint);
    const remainingLetters = value.slice(firstLetter.length);
    return `${firstLetter.toUpperCase()}${remainingLetters}`;
}
