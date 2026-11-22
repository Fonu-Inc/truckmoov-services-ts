/** The 409 body both services send while a tenant's onboarding is not fleet_ready. */
export const ONBOARDING_IN_PROGRESS = {
  code: "onboarding_in_progress",
  message: "Finish your installation before doing this. You can follow it on Get Started.",
} as const;
