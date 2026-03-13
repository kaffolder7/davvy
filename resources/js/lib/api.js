import axios from 'axios';
import { trackClientEvent } from './analytics';

export const api = axios.create({
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json',
  },
  withCredentials: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    trackApiError(error);

    return Promise.reject(error);
  },
);

/**
 * Returns the most useful error message from an API/network failure payload.
 *
 * @param {unknown} error
 * @param {string} [fallback='Something went wrong.']
 * @returns {string}
 */
export function extractError(error, fallback = 'Something went wrong.') {
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }

  if (error?.response?.data?.errors) {
    const first = Object.values(error.response.data.errors)[0];
    if (Array.isArray(first) && first[0]) {
      return first[0];
    }
  }

  return fallback;
}

/**
 * Tracks a sanitized API error event for UI reliability monitoring.
 *
 * @param {unknown} error
 * @returns {void}
 */
export function trackApiError(error) {
  const status = Number(error?.response?.status ?? 0);
  const statusFamily = status > 0 ? `${Math.floor(status / 100)}xx` : 'network';
  const route = sanitizeApiRoute(error?.config?.url ?? '');
  const method = sanitizeMethod(error?.config?.method ?? '');

  trackClientEvent('ui.api_error', {
    route,
    method,
    status_family: statusFamily,
  });
}

/**
 * Returns a normalized API route path without query/hash and raw identifiers.
 *
 * @param {unknown} rawUrl
 * @returns {string}
 */
function sanitizeApiRoute(rawUrl) {
  const input = String(rawUrl ?? '').trim();
  if (input === '') {
    return '/unknown';
  }

  let pathname = input;
  try {
    const parsed = new URL(input, 'http://localhost');
    pathname = parsed.pathname || '/';
  } catch {
    pathname = input;
  }

  const segments = pathname
    .split('?')[0]
    .split('#')[0]
    .split('/')
    .map((segment) => {
      const normalized = segment.trim();
      if (normalized === '') {
        return '';
      }

      if (/^\d+$/.test(normalized) || /^[a-f0-9-]{8,}$/i.test(normalized)) {
        return ':id';
      }

      return normalized.slice(0, 64);
    });

  const rebuilt = segments.join('/');
  if (rebuilt === '') {
    return '/unknown';
  }

  return rebuilt.startsWith('/') ? rebuilt : `/${rebuilt}`;
}

/**
 * Returns a normalized HTTP method name for analytics properties.
 *
 * @param {unknown} rawMethod
 * @returns {string}
 */
function sanitizeMethod(rawMethod) {
  const method = String(rawMethod ?? '').trim().toLowerCase();
  if (method === '') {
    return 'unknown';
  }

  return method.slice(0, 16);
}
