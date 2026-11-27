/**
 * How long the provider keeps a browser open after its last run ends. It is idle time, not total lifetime (the provider
 * allows 120-14400 s and stops a browser after 4 hours in all). It has to cover a person finishing a login or opening a
 * link the site emailed: in the 11/26-27 local test, login browsers closed 10 minutes after their run while the person
 * was still signing in, and a verification link was opened 23 minutes after its mail arrived. A browser whose submission
 * the site confirmed does not wait this out: it is released once its last page is pictured, unless another application
 * on it is not submitted yet (releaseAfterConfirmedSubmission).
 */
export const CAREER_BROWSER_KEEP_ALIVE_SECONDS = 1800;
