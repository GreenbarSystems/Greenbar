// Clerk auth middleware (AUTH-1). Protects all app + API routes except the
// public ones below. The Inngest endpoint authenticates via its own signing key,
// and the Clerk webhook verifies its Svix signature, so both are left public here.
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublic = createRouteMatcher([
  "/api/inngest(.*)",
  "/api/webhooks/clerk(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:ico|png|jpg|jpeg|svg|css|js)).*)", "/(api|trpc)(.*)"],
};
