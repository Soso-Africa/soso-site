type BrandLockupProps = {
  variant?: "black" | "white";
  size?: "header" | "footer";
  className?: string;
};

const logoSources = {
  black: "/images/soso/logo-stacked.svg",
  white: "/images/soso/logo-stacked-white.svg",
} as const;

const sizeClasses = {
  header: "w-[82px] md:w-[106px]",
  footer: "w-[128px] md:w-[152px]",
} as const;

/**
 * The approved stacked SOSO Africa mark. The image has intrinsic dimensions
 * and an explicit width so its header and footer placements never shift layout.
 */
export function BrandLockup({
  variant = "black",
  size = "header",
  className = "",
}: BrandLockupProps) {
  return (
    <img
      src={logoSources[variant]}
      alt="SOSO Africa"
      width="360"
      height="150"
      className={`h-auto ${sizeClasses[size]} ${className}`}
    />
  );
}