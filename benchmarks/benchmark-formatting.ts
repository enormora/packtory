const millisecondsPrecisionDigits = 2;
const multiplierPrecisionDigits = 3;

export function formatMilliseconds(value: number): string {
    return `${value.toFixed(millisecondsPrecisionDigits)}ms`;
}

export function formatMultiplier(value: number): string {
    return `${value.toFixed(multiplierPrecisionDigits)}x`;
}
