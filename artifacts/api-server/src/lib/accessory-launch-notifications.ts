export const ACCESSORY_LAUNCH_NOTIFICATION_POLICY_VERSION = "accessory-launch-v1";

export const ACCESSORY_LAUNCH_NOTIFICATION_STAFF_ROLES = [
  "owner",
  "administrator",
  "editor",
] as const;

export function isAuthorizedAccessoryLaunchNotificationReviewer(role: string): boolean {
  return ACCESSORY_LAUNCH_NOTIFICATION_STAFF_ROLES.includes(
    role as (typeof ACCESSORY_LAUNCH_NOTIFICATION_STAFF_ROLES)[number],
  );
}

export function isPublishedUnavailableAccessory(product: {
  department: string;
  category: string;
  fulfilmentState: string;
}, requestedCategory: string): boolean {
  return product.department === "accessories"
    && product.category === requestedCategory
    && product.fulfilmentState === "unavailable";
}