// Every route in the (dashboard) group requires an authenticated user. Next's
// route groups are invisible in the URL, so the middleware can't infer
// protection from one path prefix - enumerate the protected roots here so the
// auth boundary is enforced in one place (defense in depth alongside each
// page's own getUser() guard). `(\/|$)` anchors on a full path segment, so
// `/settings` matches but `/settings-export` does not.
// Public /docs and /security remain readable before sign-in.
const PROTECTED_APP_PATHS =
  /^\/(dashboard|alerts|connect|developer|settings|tools)(\/|$)/

export function isProtectedAppPath(pathname: string): boolean {
  return PROTECTED_APP_PATHS.test(pathname)
}
