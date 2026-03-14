import React from 'react';
import logoAsset from '../../../../assets/logo/logo_.svg';

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
            <img
                src={logoAsset}
                alt="LiteBI Studio"
                width={size}
                height={size}
                className="block w-full h-full object-contain"
            />
        </div>
    );
};

export default AppBrandIcon;
