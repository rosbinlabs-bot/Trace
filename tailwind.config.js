/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff', 100: '#dae6ff', 200: '#bcd1ff', 300: '#8eb2ff', 400: '#5b8bff',
          500: '#3b5bdb', 600: '#324bbd', 700: '#28399a', 800: '#22307c', 900: '#1f2a63',
        },
      },
    },
  },
  plugins: [],
}
