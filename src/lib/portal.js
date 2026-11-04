// Customers use the app at /, service partners a separate app at /partner.
// An Android build has no path to read, so each APK is built with
// VITE_PORTAL set to the app it is; on the web the path still decides.
export const PORTAL =
  import.meta.env.VITE_PORTAL === 'partner' ||
  /^\/partner(\/|$)/.test(window.location.pathname)
    ? 'partner'
    : 'member';
