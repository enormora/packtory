type TerminalStream = {
    readonly isTTY: boolean | undefined;
};

export function isTerminal(stream: TerminalStream): boolean {
    return stream.isTTY === true;
}
