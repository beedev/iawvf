import type { VdfRole } from '../types/api';

/**
 * The fixed dev user directory mirrored from the API (`DevUserDirectory`). Used by the login screen
 * and the role switcher. Passwords here are non-secret, dev-only credentials — the same ones the API
 * accepts locally — and exist purely to exercise the JWT + role pipeline.
 */
export interface DevUser {
  username: string;
  password: string;
  label: string;
  roles: VdfRole[];
  description: string;
}

export const DEV_USERS: DevUser[] = [
  {
    username: 'author',
    password: 'author-pw',
    label: 'Author',
    roles: ['Author'],
    description: 'Interpret, lint, paraphrase, dry-run, and save draft rules.',
  },
  {
    username: 'reviewer',
    password: 'reviewer-pw',
    label: 'Reviewer',
    roles: ['Reviewer'],
    description: 'Approve the active version of a rule.',
  },
  {
    username: 'admin',
    password: 'admin-pw',
    label: 'Admin',
    roles: ['Admin'],
    description: 'Promote (enable) and disable rules.',
  },
  {
    username: 'lead',
    password: 'lead-pw',
    label: 'Lead',
    roles: ['Author', 'Reviewer', 'Admin'],
    description: 'Combined account for end-to-end authoring and governance.',
  },
];

export function devUserByUsername(username: string): DevUser | undefined {
  return DEV_USERS.find((u) => u.username === username);
}
