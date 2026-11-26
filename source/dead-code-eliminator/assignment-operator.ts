import { SyntaxKind } from 'ts-morph';

export function isAssignmentOperator(kind: SyntaxKind): boolean {
    return kind >= SyntaxKind.FirstAssignment && kind <= SyntaxKind.LastAssignment;
}
