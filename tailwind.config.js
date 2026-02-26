/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './resources/**/*.blade.php',
    './resources/**/*.js',
    './resources/**/*.jsx',
  ],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 14px 40px -18px rgba(12, 56, 51, 0.35)',
      },
    },
  },
  plugins: [],
};
