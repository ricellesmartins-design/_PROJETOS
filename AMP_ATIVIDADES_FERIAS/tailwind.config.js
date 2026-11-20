/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        idg: { navy: '#1B2A5C', blue: '#24418F', orange: '#F28C1B', green: '#2E9E4F' },
      },
      fontFamily: { sans: ['Inter', 'Segoe UI', 'Arial', 'sans-serif'] },
    },
  },
  plugins: [],
};
