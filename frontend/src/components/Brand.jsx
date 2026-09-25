import { createContext, useContext } from "react";
import { Activity } from "lucide-react";
import { assetUrl } from "@/lib/api";

export const DEFAULT_BRAND = { workspace_name: "Scada by T4bun", workspace_logo: "" };
export const BrandContext = createContext({ brand: DEFAULT_BRAND, setBrand: () => {} });
export const useBrand = () => useContext(BrandContext);

export const Brand = ({ size = "sm" }) => {
  const { brand } = useBrand();
  const box = size === "lg" ? "w-8 h-8" : "w-7 h-7";
  return (
    <span className="flex items-center gap-2 min-w-0" data-testid="workspace-brand">
      {brand.workspace_logo
        ? <img src={assetUrl(brand.workspace_logo)} alt="" data-testid="workspace-logo" className={`${box} object-contain rounded-sm`} />
        : <span className={`${box} bg-blue-600 grid place-items-center rounded-sm`}><Activity size={size === "lg" ? 17 : 15} /></span>}
      <span data-testid="workspace-name" className={`font-heading font-black tracking-tight truncate ${size === "lg" ? "text-lg" : ""}`}>{brand.workspace_name}</span>
    </span>
  );
};
