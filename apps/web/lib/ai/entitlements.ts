import type { UserType } from "@/app/(auth)/auth";

type Entitlements = {
  maxMessagesPerHour: number;
  // Images a user may generate in a calendar month (comic panels, today).
  // `null` is no limit: everything is free for now, and every image is still
  // counted (getImageCountThisMonth), so a free tier — 100 a month, say — is
  // this one number when it is wanted.
  maxImagesPerMonth: number | null;
};

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  guest: {
    maxImagesPerMonth: null,
    maxMessagesPerHour: 10,
  },
  regular: {
    maxImagesPerMonth: null,
    maxMessagesPerHour: 10,
  },
};
