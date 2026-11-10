import type { EvaluatedValue } from '../evaluation/primitive-value.ts';

function numberSource(value: number): string {
    if (Object.is(value, -0)) {
        return '-0';
    }
    if (Number.isNaN(value)) {
        return '0 / 0';
    }
    if (Number.isFinite(value)) {
        return String(value);
    }
    return value < 0 ? '-1 / 0' : '1 / 0';
}

export function primitiveSource(result: EvaluatedValue): string {
    const { value } = result;
    if (value === undefined) {
        return 'void 0';
    }
    if (typeof value === 'number') {
        return numberSource(value);
    }
    if (typeof value === 'bigint') {
        return `${value}n`;
    }
    return typeof value === 'string' ? JSON.stringify(value) : String(value);
}
