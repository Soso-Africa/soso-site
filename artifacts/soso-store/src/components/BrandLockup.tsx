type BrandLockupProps = {
  variant?: "black" | "white";
  size?: "header" | "footer";
  className?: string;
};

const sizeClasses = {
  header: "w-[112px] md:w-[132px]",
  footer: "w-[128px] md:w-[152px]",
} as const;

/**
 * The approved stacked SOSO Africa mark. Rendering the lettering inline keeps
 * it tied to the Montserrat font loaded by the storefront instead of relying
 * on the visitor having Montserrat installed for an external SVG image.
 */
export function BrandLockup({
  variant = "black",
  size = "header",
  className = "",
}: BrandLockupProps) {
  const fill = variant === "white" ? "#FFFFFF" : "#262626";

  return (
    <svg
      viewBox="0 0 360 150"
      role="img"
      aria-label="SOSO Africa"
      className={`h-auto ${sizeClasses[size]} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="180"
        y="78"
        textAnchor="middle"
        fill={fill}
        fontFamily="Montserrat, sans-serif"
        fontSize="64"
        fontWeight="700"
        letterSpacing="17"
      >
        SOSO
      </text>
      <text
        x="180"
        y="122"
        textAnchor="middle"
        fill={fill}
        fontFamily="Montserrat, sans-serif"
        fontSize="24"
        fontWeight="600"
        letterSpacing="18"
      >
        AFRICA
      </text>
    </svg>
  );
}