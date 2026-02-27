import React from 'react';

interface AppBrandIconProps {
    size?: number;
    className?: string;
}

export const AppBrandIcon: React.FC<AppBrandIconProps> = ({ size = 40, className = '' }) => {
    return (
        <div
            className={`relative inline-flex items-center justify-center ${className}`}
            style={{ width: size, height: size }}
            aria-hidden="true"
        >
            <svg
                viewBox="0 0 64 64"
                width={size}
                height={size}
                className="overflow-visible"
                role="img"
                aria-label="LiteBI Studio"
            >
                <defs>
                    <linearGradient id="litebi-bars" x1="0" y1="1" x2="1" y2="0">
                        <stop offset="0%" stopColor="#73e23d" />
                        <stop offset="45%" stopColor="#19b57a" />
                        <stop offset="100%" stopColor="#0b8fe9" />
                    </linearGradient>
                    <linearGradient id="litebi-arrow" x1="0" y1="1" x2="1" y2="0">
                        <stop offset="0%" stopColor="#1fb2ff" />
                        <stop offset="100%" stopColor="#147be9" />
                    </linearGradient>
                    <linearGradient id="litebi-dot" x1="0" y1="1" x2="1" y2="0">
                        <stop offset="0%" stopColor="#2ecb7f" />
                        <stop offset="100%" stopColor="#7ddf3b" />
                    </linearGradient>
                </defs>
                <path d="M5 52c10 3 22 3 35 0" fill="none" stroke="#3f78a3" strokeWidth="3.2" strokeLinecap="round" opacity="0.9" />
                <path d="M8 47h7V38H8zM17 47h8V34h-8zM27 47h8V30h-8zM37 47h10V22h-10z" fill="url(#litebi-bars)" />
                <path d="M7 33c11 0 20-3 28-12" fill="none" stroke="url(#litebi-arrow)" strokeWidth="3.4" strokeLinecap="round" />
                <path d="M32 19l7-2-2 7z" fill="url(#litebi-arrow)" />
                <circle cx="49" cy="13" r="3.9" fill="url(#litebi-dot)" />
            </svg>
        </div>
    );
};

export default AppBrandIcon;
