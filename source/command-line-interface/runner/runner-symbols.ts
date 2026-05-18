import { bold, green, red, yellow } from 'yoctocolors';

export function getErrorSymbol(): string {
    return bold(red('✖'));
}

export function getSuccessSymbol(): string {
    return bold(green('✔'));
}

export function getWarningSymbol(): string {
    return yellow('⚠');
}
