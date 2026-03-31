/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta profissional para RH (Azul marinho e cinzas)
        sidebar: "#1e293b", // Slate 800
        primary: "#3b82f6", // Blue 500
        background: "#f8fafc", // Slate 50
      }
    },
  },
  plugins: [],
}