import React from 'react';

export const CLARO_TECHNICIAN_IMAGE_URL =
  '/src/assets/images/modelo_tecnico_claro_1790693676756.jpg';

/**
 * Recreación vectorial de alta precisión del emblema suministrado:
 * "LOGO UCT NUEVOS-11.png" (Círculo negro con la "U" blanca, engrane + escudo con check verde,
 * logo Claro con sus tres rayos blancos y "Tecnología" en la base).
 */
export const UClaroTecnologiaLogo: React.FC<{ className?: string }> = ({
  className = 'w-14 h-14',
}) => {
  return (
    <svg
      viewBox="0 0 240 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="U Claro Tecnología"
    >
      {/* Fondo circular negro */}
      <circle cx="120" cy="120" r="118" fill="#000000" />

      {/* Letra "U" blanca gruesa con bordes redondeados */}
      <path
        d="M89 52V94C89 111.5 101.5 123 118 123C134.5 123 147 111.5 147 94V52"
        stroke="#FFFFFF"
        strokeWidth="23"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Icono superior derecho: Engrane blanco + Escudo blanco con Check verde */}
      <g transform="translate(142, 16)">
        {/* Dientes del engrane */}
        <circle cx="13" cy="14" r="6.5" stroke="#FFFFFF" strokeWidth="2.6" fill="#000000" />
        <path
          d="M13 4.5V7M13 21V23.5M3.5 14H6M20 14H22.5M6.3 7.3L8.2 9.2M17.8 18.8L19.7 20.7M19.7 7.3L17.8 9.2M8.2 18.8L6.3 20.7"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        {/* Escudo superpuesto */}
        <path
          d="M23 11.5C23 11.5 29.5 13.5 36.5 11.5V23.5C36.5 31.5 29.5 36.5 23 39.5C16.5 36.5 9.5 31.5 9.5 23.5V11.5C16.5 13.5 23 11.5 23 11.5Z"
          fill="#000000"
          stroke="#FFFFFF"
          strokeWidth="2"
        />
        <path
          d="M23 14C23 14 28.2 15.5 33.8 14V23.2C33.8 29.5 28.2 33.5 23 36C17.8 33.5 12.2 29.5 12.2 23.2V14C17.8 15.5 23 14 23 14Z"
          fill="#FFFFFF"
        />
        {/* Check verde corporativo de seguridad y calidad */}
        <path
          d="M17.2 24.2L21.5 29.2L32.5 16.5"
          stroke="#00B140"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* Rayos característicos del logo Claro sobre la "o" */}
      <rect x="160" y="114" width="6.5" height="20" rx="1.5" fill="#FFFFFF" />
      <path
        d="M174 133L190 117"
        stroke="#FFFFFF"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <rect x="181" y="143" width="19" height="6.5" rx="1.5" fill="#FFFFFF" />

      {/* Texto "Claro" */}
      <text
        x="114"
        y="164"
        textAnchor="middle"
        fill="#FFFFFF"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontWeight="900"
        fontSize="43"
        letterSpacing="-1"
      >
        Claro
      </text>

      {/* Texto "Tecnología" */}
      <text
        x="120"
        y="196"
        textAnchor="middle"
        fill="#FFFFFF"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontWeight="700"
        fontSize="25"
        letterSpacing="0.3"
      >
        Tecnología
      </text>
    </svg>
  );
};
