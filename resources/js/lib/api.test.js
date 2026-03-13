import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackClientEvent } from './analytics';
import { extractError, trackApiError } from './api';

vi.mock('./analytics', () => ({
  trackClientEvent: vi.fn(),
}));

describe('extractError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('tracks ui api errors with sanitized route metadata', () => {
    trackApiError({
      response: {
        status: 422,
      },
      config: {
        url: '/api/contacts/123?tab=all',
        method: 'PATCH',
      },
    });

    expect(trackClientEvent).toHaveBeenCalledWith('ui.api_error', {
      route: '/api/contacts/:id',
      method: 'patch',
      status_family: '4xx',
    });
  });

  it('tracks network failures without a response status', () => {
    trackApiError({
      config: {
        url: '',
        method: '',
      },
    });

    expect(trackClientEvent).toHaveBeenCalledWith('ui.api_error', {
      route: '/unknown',
      method: 'unknown',
      status_family: 'network',
    });
  });
});
