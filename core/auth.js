/**
 * Akasha Library — Google OAuth Authentication
 *
 * Uses Google Identity Services (GIS) for OAuth 2.0 with drive.file scope.
 * Config is loaded from config.js to keep credentials out of source.
 */

let tokenClient = null;
let accessToken = null;
let userProfile = null;

const SCOPES = 'https://www.googleapis.com/auth/drive.file';

/**
 * Initialize Google auth. Must be called after config is loaded.
 * @param {string} clientId - Google OAuth Client ID
 * @param {function} onAuthChange - Callback when auth state changes
 */
export function initAuth(clientId, onAuthChange) {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (response) => {
          if (response.access_token) {
            accessToken = response.access_token;
            fetchUserProfile().then(() => {
              if (onAuthChange) onAuthChange({ signedIn: true, user: userProfile });
            });
          }
        },
      });
      resolve();
    };
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

/**
 * Trigger sign-in popup
 */
export function signIn() {
  if (!tokenClient) return;
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

/**
 * Sign out (revoke token)
 */
export function signOut(onAuthChange) {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken);
    accessToken = null;
    userProfile = null;
    if (onAuthChange) onAuthChange({ signedIn: false, user: null });
  }
}

/**
 * Get current access token (null if not signed in)
 */
export function getToken() {
  return accessToken;
}

/**
 * Check if user is signed in
 */
export function isSignedIn() {
  return !!accessToken;
}

/**
 * Get user profile info
 */
export function getUser() {
  return userProfile;
}

/**
 * Fetch user's basic profile (name, email, avatar)
 */
async function fetchUserProfile() {
  if (!accessToken) return;
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (res.ok) {
      userProfile = await res.json();
    }
  } catch (e) {
    console.warn('Failed to fetch user profile:', e);
  }
}
