import { convert } from 'unix-permissions';

function hasExecutePermission(permission: { execute?: boolean | undefined } | undefined): boolean {
    if (permission === undefined) {
        return false;
    }

    return permission.execute === true;
}

function areAllPermissionsExecutable(permissions: ReturnType<typeof convert.object>): boolean {
    return (
        hasExecutePermission(permissions.user) &&
        hasExecutePermission(permissions.group) &&
        hasExecutePermission(permissions.others)
    );
}

function getPermissions(mode: number): ReturnType<typeof convert.object> | null {
    try {
        return convert.object(mode);
    } catch {
        return null;
    }
}

export function isExecutableFileMode(mode: number): boolean {
    const permissions = getPermissions(mode);

    if (permissions === null) {
        return false;
    }

    return areAllPermissionsExecutable(permissions);
}
