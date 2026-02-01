# Accountability Lock Extension

A Chrome Extension that helps you limit distraction by requiring a friend's permission (via TOTP Code) to unlock websites after a daily limit.

## Features
- **Time Limits**: Set daily limits for specific websites (e.g., 30 mins for YouTube).
- **Friend Lock**: To get more time, you need a 6-digit code that only your friend has.
- **Offline & Secure**: Uses standard TOTP (like Google Authenticator). No servers, no tracking.
- **Multi-Key Support**: Assign different friends (keys) to different websites.
- **Locked Deletion**: You cannot delete a rule without the friend's permission code.

## Installation
1.  Clone this repository.
2.  Open Chrome and go to `chrome://extensions`.
3.  Enable **Developer Mode** (top right).
4.  Click **Load Unpacked**.
5.  Select the `extension` folder from this repo.

## How to Use
1.  **Create a Key**: Go to Options -> Verification Keys. Create a key (e.g., "Mom") and define a duration (e.g., 15 mins).
2.  **Scan QR**: Have your friend scan the QR code with any Authenticator App (Google Auth, Authy, Samsung Pass, etc.).
3.  **Block Site**: Add a site (e.g., `twitter.com`), set a limit, and select the Key.
4.  **Unlock**: When blocked, ask your friend for the code to unlock it for the specific duration!

## Development
- `src/background.js`: Core Service Worker logic (time tracking, state management).
- `src/pages/options`: Configuration UI.
- `src/pages/blocked`: Unlock Screen.
- `src/lib`: Local copies of `otpauth` and `qrcode` libraries (zero external dependencies).
