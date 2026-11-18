// Tiny client-side navigation helper (the app uses pushState routing).
export function navigateToSignIn() {
  window.history.pushState({}, '', '/signin');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export const shortSendLink = (deviceId: string) => `${window.location.origin}/to/${deviceId}`;

export function navigateToDevices(toId?: string) {
  window.history.pushState({}, '', toId ? `/devices?to=${encodeURIComponent(toId)}` : '/devices');
  window.dispatchEvent(new PopStateEvent('popstate'));
}
