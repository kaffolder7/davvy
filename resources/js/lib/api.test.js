import { describe, expect, it } from 'vitest';
import { extractError } from './api';

describe('extractError', () => {
  it('returns top-level API message when available', () => {
    const error = {
      response: {
        data: {
          message: 'Invalid login credentials.',
        },
      },
    };

    expect(extractError(error)).toBe('Invalid login credentials.');
  });

  it('returns first validation error message', () => {
    const error = {
      response: {
        data: {
          errors: {
            email: ['The email field is required.'],
            password: ['The password field is required.'],
          },
        },
      },
    };

    expect(extractError(error)).toBe('The email field is required.');
  });

  it('returns caller fallback when payload does not include known keys', () => {
    expect(extractError({}, 'Request failed.')).toBe('Request failed.');
  });
});
