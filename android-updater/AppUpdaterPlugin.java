package com.provoda.staff;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.webkit.URLUtil;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private BroadcastReceiver receiver;

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url", "");
        Uri uri = Uri.parse(url);
        if (!"https".equalsIgnoreCase(uri.getScheme())
                || !"github.com".equalsIgnoreCase(uri.getHost())
                || uri.getPath() == null
                || !uri.getPath().startsWith("/Vadimaok/provadastaff/releases/")) {
            call.reject("Ссылка на APK не прошла проверку безопасности.");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(settings);
                JSObject result = new JSObject();
                result.put("permissionRequired", true);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Не удалось открыть настройки разрешения на установку APK.", e);
            }
            return;
        }

        try {
            DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) {
                call.reject("На устройстве недоступна служба загрузки Android.");
                return;
            }

            DownloadManager.Request request = new DownloadManager.Request(uri);
            request.setTitle("Обновление Provoda Staff");
            request.setDescription("Загрузка новой версии приложения");
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(false);
            request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS,
                    "Provoda-Staff-Android.apk");

            final long[] downloadId = new long[] {-1L};
            unregisterReceiver();
            receiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (intent == null || !DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) return;
                    long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -2L);
                    if (completedId != downloadId[0]) return;
                    unregisterReceiver();
                    DownloadManager.Query query = new DownloadManager.Query().setFilterById(completedId);
                    try (android.database.Cursor cursor = manager.query(query)) {
                        if (cursor == null || !cursor.moveToFirst()) return;
                        int statusColumn = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                        if (statusColumn < 0 || cursor.getInt(statusColumn) != DownloadManager.STATUS_SUCCESSFUL) return;
                    }
                    Uri apkUri = manager.getUriForDownloadedFile(completedId);
                    if (apkUri == null) return;
                    Intent install = new Intent(Intent.ACTION_VIEW);
                    install.setDataAndType(apkUri, "application/vnd.android.package-archive");
                    install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    try {
                        getContext().startActivity(install);
                    } catch (Exception ignored) {
                        // Keep the completed download available in Android's download notification.
                    }
                }
            };
            IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
            if (Build.VERSION.SDK_INT >= 33) {
                getContext().registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                getContext().registerReceiver(receiver, filter);
            }
            downloadId[0] = manager.enqueue(request);
            JSObject result = new JSObject();
            result.put("started", true);
            result.put("downloadId", downloadId[0]);
            call.resolve(result);
        } catch (Exception e) {
            unregisterReceiver();
            call.reject("Не удалось начать загрузку обновления.", e);
        }
    }

    private void unregisterReceiver() {
        if (receiver == null) return;
        try {
            getContext().unregisterReceiver(receiver);
        } catch (Exception ignored) {}
        receiver = null;
    }

    @Override
    protected void handleOnDestroy() {
        unregisterReceiver();
        super.handleOnDestroy();
    }
}
