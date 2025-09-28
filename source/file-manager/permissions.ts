import { convert } from 'unix-permissions';

// eslint-disable-next-line complexity -- needs to be refactored
export function isExecutableFileMode(mode: number): boolean {
    try {
        const permissions = convert.object(mode);
        return (
            permissions.user?.execute === true &&
            permissions.group?.execute === true &&
            permissions.others?.execute === true
        );
    } catch {
        return false;
    }
}
