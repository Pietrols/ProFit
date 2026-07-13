// Friendly client-side validation, mirroring the backend Zod rules.
export function validateEmail(email: string): string | undefined {
  if (!email.trim()) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return 'That does not look like an email address';
  }
}

export function validatePassword(password: string): string | undefined {
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password needs at least 8 characters';
  if (password.length > 72) return 'Password is too long (max 72)';
}

export function validateDisplayName(name: string): string | undefined {
  if (!name.trim()) return 'Display name is required';
  if (name.trim().length > 50) return 'Display name is too long (max 50)';
}

export function validatePasswordMatch(
  password: string,
  confirm: string,
): string | undefined {
  if (!confirm) return 'Please confirm your password';
  if (password !== confirm) return 'Passwords do not match';
}
