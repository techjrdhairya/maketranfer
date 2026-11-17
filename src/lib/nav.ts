// Tiny client-side navigation helper (the app uses pushState routing).
export function navigateToSignIn() {
  window.history.pushState({}, '', '/signin');
  window.dispatchEvent(new PopStateEvent('popstate'));
}
