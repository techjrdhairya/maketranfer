import React from 'react';

interface LogoProps {
  className?: string;
  size?: number | string;
  withBackground?: boolean;
}

export const Logo: React.FC<LogoProps> = ({
  className = 'w-6 h-6',
  withBackground = false,
}) => {
  const svgContent = (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="MakeTransfer Logo"
    >
      {/* Document Outer Frame */}
      <path
        d="M 280 115 L 180 115 C 152 115 130 137 130 165 L 130 355 C 130 383 152 405 180 405 L 315 405 C 343 405 365 383 365 355 L 365 200 Z"
        stroke="currentColor"
        strokeWidth="24"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dog-ear Fold */}
      <path
        d="M 280 115 L 280 175 C 280 190 290 200 305 200 L 365 200"
        stroke="currentColor"
        strokeWidth="24"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Document Text Lines */}
      <line
        x1="185"
        y1="210"
        x2="305"
        y2="210"
        stroke="currentColor"
        strokeWidth="20"
        strokeLinecap="round"
      />
      <line
        x1="185"
        y1="250"
        x2="305"
        y2="250"
        stroke="currentColor"
        strokeWidth="20"
        strokeLinecap="round"
      />
      <line
        x1="185"
        y1="290"
        x2="250"
        y2="290"
        stroke="currentColor"
        strokeWidth="20"
        strokeLinecap="round"
      />

      {/* Swooshing Rising Bands */}
      <path
        d="M 175 405 C 185 320 250 250 355 215 C 330 255 285 330 215 405 Z"
        fill="currentColor"
      />
      <path
        d="M 235 405 C 250 340 300 280 375 240 C 355 275 320 345 275 405 Z"
        fill="currentColor"
      />

      {/* Dynamic Arrow Head */}
      <path
        d="M 295 405 C 315 360 355 305 405 260 L 390 295 L 440 190 L 335 220 L 370 235 C 320 285 280 345 265 405 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (withBackground) {
    return (
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-pink-600 flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform overflow-hidden p-1.5">
        {svgContent}
      </div>
    );
  }

  return svgContent;
};

export default Logo;
