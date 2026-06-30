import { convert } from 'unix-permissions';

type PermissionReader = (mode: number) => ReturnType<typeof convert.object>;

type PermissionDependencies = {
    readonly convertObject: PermissionReader;
};

function hasExecutePermission(permission: { readonly execute?: boolean | undefined; } | undefined): boolean {
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

function getPermissions(mode: number, convertObject: PermissionReader): ReturnType<typeof convert.object> | null {
    try {
        return convertObject(mode);
    } catch {
        return null;
    }
}

export function isExecutableFileMode(mode: number, dependencies: Partial<PermissionDependencies> = {}): boolean {
    const convertObject = dependencies.convertObject ?? convert.object;
    const permissions = getPermissions(mode, convertObject);

    if (permissions === null) {
        return false;
    }

    return areAllPermissionsExecutable(permissions);
}
