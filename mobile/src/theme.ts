// Misma paleta que frontend/tailwind.config.js (web) para que ambas apps
// se sientan del mismo sistema.
export const colors = {
  primary: "#0F766E",
  success: "#15803D",
  warning: "#F59E0B",
  danger: "#EF4444",
  neutral: "#4B635B",
  bg: "#F5FAF7",
  sidebar: "#0B3D2E",
  border: "#D9E6DE",
  text: "#1A2E25",
  white: "#FFFFFF",
};

// Paleta de marca de la app móvil (concepto Cointra: azul/verde/naranja/
// amarillo). La usan Inicio, Solicitudes, Tarifas y Manifiesto. `colors`
// (arriba) queda para login/bienvenida y sigue compartida con la web.
export const brand = {
  bg: "#F5F8FA",
  white: "#FFFFFF",
  navy: "#0B2B4D",
  navySecondary: "#174676",
  navyDark: "#001428",
  green: "#009966",
  greenLight: "#DCF5EC",
  orange: "#FF6600",
  orangeLight: "#FFE6D3",
  yellow: "#FFCC00",
  yellowDark: "#B98900", // amarillo legible como texto sobre blanco
  textPrimary: "#112240",
  textSecondary: "#6B7280",
  danger: "#DC2626",
  dangerLight: "#FDECEC",
  border: "#E1E8F0",
  pill: "#EEF3F8",
  pillBorder: "#E1E8F0",
};

/** @deprecated usar `brand` */
export const cointraHome = brand;
