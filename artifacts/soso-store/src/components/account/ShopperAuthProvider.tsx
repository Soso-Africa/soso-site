/** Compatibility wrapper (filename retained). Clerk has been removed. */
import type { ReactNode } from "react";
import { OwnedShopperAuthProvider } from "./OwnedShopperAuthProvider";

export function ShopperAuthProvider({ children, privateAccount = false }: { children: ReactNode; privateAccount?: boolean }) {
  return <OwnedShopperAuthProvider privateAccount={privateAccount}>{children}</OwnedShopperAuthProvider>;
}
