/**
 * Application roles for RBAC (G2). Later controllers gate actions with @Roles().
 */
export enum Role {
  Author = 'Author',
  Reviewer = 'Reviewer',
  Admin = 'Admin',
}
