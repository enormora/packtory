import { convert } from 'unix-permissions';

export function isExecutableFileMode(mode: number): boolean {
    try {
        const permissions = convert.object(mode);
        return [permissions.user, permissions.group, permissions.others].every((entry) => {
            return entry?.execute === true;
        });
    } catch {
        return false;
    }
}
