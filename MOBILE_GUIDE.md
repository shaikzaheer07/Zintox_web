# 📱 Zintox Mobile APK Guide (Capacitor)

This guide explains how to convert your Zintox React app into a native Android APK using the Capacitor setup I've already initialized in this project.

## 1. Prerequisites (Install these on your LOCAL computer)

1.  **Node.js & NPM**: (You already have this).
2.  **Android Studio**: Essential for building the APK. [Download here](https://developer.android.com/studio).
3.  **Java JDK 17+**: Required by Android Studio.
4.  **Gradle**: Usually comes with Android Studio.

---

## 2. Setting Up Your Hosted Backend

Mobile apps cannot use relative paths like `/api/login`. I've already updated the code to support a central `VITE_API_URL`.

1.  **Host your backend online** (e.g., on Render, Railway, or VPS).
2.  **Update Environment Variable**: 
    In your local project, create a `.env` file (or update your CI/CD):
    ```env
    VITE_API_URL=https://your-backend-api.com
    ```
3.  **CORS**: Ensure your Express backend allows requests from `http://localhost` (Capacitor's internal origin).
    ```ts
    // In server.ts
    app.use(cors({
      origin: ['http://localhost', 'https://your-web-url.com'],
      credentials: true
    }));
    ```

---

## 3. How to Build the APK (Step-by-Step)

Run these commands in your terminal on your **LOCAL** machine:

### Step 1: Build the Web Project
This bundles your React code into the `dist` folder.
```bash
npm run build
```

### Step 2: Sync with Capacitor
This copies the `dist` folder into the Android project.
```bash
npx cap sync
```

### Step 3: Open in Android Studio
This launches the native IDE to compile the APK.
```bash
npx cap open android
```

### Step 4: Build APK in Android Studio
1.  Wait for Gradle to finish indexing (check the bottom progress bar).
2.  Go to **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
3.  Once finished, a notification will appear. Click **Locate** to find your `app-debug.apk`.

---

## 4. Testing on an Android Device

### Option A: Physical Device (Recommended)
1.  Enable **Developer Options** on your phone (Tap "Build Number" 7 times in Settings).
2.  Enable **USB Debugging**.
3.  Connect phone to your PC via USB.
4.  In Android Studio, click the **Play (Run)** icon.

### Option B: Emulator
1.  In Android Studio, open **Device Manager**.
2.  Create a Virtual Device (e.g., Pixel 7).
3.  Click the **Play** icon to start the app in the emulator.

---

## 5. Environment Variables in Mobile
Capacitor bundles whatever variables were present during `npm run build`. 
- For Development: Use `.env.development`.
- For Production/APK: Use `.env.production`.
- Vite automatically injects `VITE_` variables into the build.

---

## 6. Roadmap to Play Store

1.  **App Icons & Splash Screens**: 
    - Install `@capacitor/assets`.
    - Put your logo in `assets/logo.png`.
    - Run `npx capacitor-assets generate --android`.
2.  **Sign the APK**:
    - Build a **Release APK** or **AAB** (App Bundle).
    - Create a Keystore file (Android Studio facilitates this).
3.  **Play Console**:
    - Pay the $25 one-time fee.
    - Upload your `.aab` file.
    - Provide app descriptions and screenshots.

---

## 🚀 Native Features I've enabled for you:
- **FileSystem**: Can be used for saving snaps locally.
- **Camera**: Already integrated with Capacitor-friendly `getUserMedia` (fallback). For better native performance, you can later add `@capacitor/camera`.
- **Push Notifications**: Can be added via `@capacitor/push-notifications`.
