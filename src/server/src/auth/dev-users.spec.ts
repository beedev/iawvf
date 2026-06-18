import { verifyDevCredentials } from './dev-users';
import { Role } from './roles.enum';

describe('verifyDevCredentials', () => {
  it('accepts each seeded user with the correct roles', () => {
    expect(verifyDevCredentials('author', 'author-pw')).toEqual({
      username: 'author',
      roles: [Role.Author],
    });
    expect(verifyDevCredentials('reviewer', 'reviewer-pw')).toEqual({
      username: 'reviewer',
      roles: [Role.Reviewer],
    });
    expect(verifyDevCredentials('admin', 'admin-pw')).toEqual({
      username: 'admin',
      roles: [Role.Admin],
    });
    expect(verifyDevCredentials('lead', 'lead-pw')).toEqual({
      username: 'lead',
      roles: [Role.Author, Role.Reviewer, Role.Admin],
    });
  });

  it('rejects a wrong password', () => {
    expect(verifyDevCredentials('author', 'nope')).toBeNull();
  });

  it('rejects an unknown user', () => {
    expect(verifyDevCredentials('ghost', 'author-pw')).toBeNull();
  });
});
