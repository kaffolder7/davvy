import axios from 'axios';

const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

export const api = axios.create({
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
    ...(token ? { 'X-CSRF-TOKEN': token } : {}),
    Accept: 'application/json',
  },
  withCredentials: true,
});

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
