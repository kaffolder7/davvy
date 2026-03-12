import axios from 'axios';

export const api = axios.create({
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json',
  },
  withCredentials: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
});

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
