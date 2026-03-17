/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#0F766E",
        success: "#15803D",
        warning: "#F59E0B",
        danger: "#EF4444",
        neutral: "#4B635B",
        bg: "#F5FAF7",
        sidebar: "#0B3D2E",
        border: "#D9E6DE",
        text: "#1A2E25",
      },
    },
  },
  plugins: [],
};

