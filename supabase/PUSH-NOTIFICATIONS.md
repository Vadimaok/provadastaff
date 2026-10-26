# Android push notifications (FCM)

The APK uses Android's system notification tray through Capacitor Push Notifications and Firebase Cloud Messaging (FCM). A browser `Notification` is not a replacement for remote push: FCM is what delivers notifications while the app is backgrounded or closed.

## One-time setup

1. In Firebase Console, create/select a Firebase project and add an Android app with package ID `com.vadimaok.minitrati`. Download its `google-services.json` file.
2. In GitHub → Settings → Secrets and variables → Actions, add repository secret `GOOGLE_SERVICES_JSON_BASE64`. Its value must be the Base64 encoding of the complete JSON file (for example, `base64 -w 0 google-services.json` on Linux/macOS).
3. In Firebase Console → Project settings → Service accounts, create a service-account JSON key for the Firebase Admin SDK. Keep it private.
4. Deploy the Edge Function from this repository:
   ```sh
supabase functions deploy send-push
```
5. Set Supabase Edge Function secrets:
   ```sh
supabase secrets set FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}' PUSH_WEBHOOK_SECRET='a-long-random-secret'
```
   `FIREBASE_SERVICE_ACCOUNT` must contain the full service-account JSON as one JSON string. Never commit it or put it in browser code.
6. In Supabase → Database → Webhooks, create **two INSERT webhooks** pointing to `https://<PROJECT_REF>.supabase.co/functions/v1/send-push`:
   - table `public.user_notifications` for task/report notifications;
   - table `public.app_update_notices` for update announcements.
   Add header `x-push-webhook-secret: <same PUSH_WEBHOOK_SECRET>` to both. Use the project reference from the Supabase URL.
7. Run the updated `supabase/admin.sql` in Supabase SQL Editor so the private token table and registration RPCs exist.
8. Push a commit to trigger **Build Android APK**, then install the new APK, open it, sign in and allow Android notifications.

## Android settings

If permission was previously denied, open Android Settings → Apps → Provoda Staff → Notifications and enable notifications. Disable battery restrictions for Provoda Staff if the phone's vendor aggressively delays background work. FCM is normally delivered by Android/Google Play services, but no app can promise exact delivery time when the device is offline, in battery saver, or restricted by the OS.

The app stores each device's FCM token under the signed-in account. Signing into a different account on the same device reassigns the token to that account.
