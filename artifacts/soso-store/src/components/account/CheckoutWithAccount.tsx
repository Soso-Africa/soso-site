import Checkout from "@/pages/Checkout";

/** Checkout stays guest-friendly; Checkout mounts the SOSO shopper session provider itself. */
export default function CheckoutWithAccount() {
  return <Checkout />;
}
