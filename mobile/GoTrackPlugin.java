package app.gotrack.android;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Speichert die Daten sicher in der App und exportiert Dateien nach Downloads/GoTrack Export.
 * Dieselbe Logik wie am PC (main.js): erst temporaere Datei, dann umbenennen; Sicherung (.bak);
 * eine beschaedigte Datei wird nie ueberschrieben, sondern umbenannt.
 */
@CapacitorPlugin(name = "GoTrack")
public class GoTrackPlugin extends Plugin {
  private static final int MAX_BYTES = 20 * 1024 * 1024;
  private static final String EXPORT_FOLDER = "GoTrack Export";

  private File dataFile() {
    return new File(getContext().getFilesDir(), "gotrack-data.json");
  }

  private static String readText(File file) {
    try (FileInputStream in = new FileInputStream(file)) {
      java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
      byte[] buf = new byte[8192];
      int n;
      while ((n = in.read(buf)) > 0) buffer.write(buf, 0, n);
      return new String(buffer.toByteArray(), StandardCharsets.UTF_8);
    } catch (Exception e) {
      return null;
    }
  }

  private static String readValidJson(File file) {
    String text = readText(file);
    if (text == null) return null;
    try {
      new JSONObject(text);
      return text;
    } catch (Exception e) {
      return null;
    }
  }

  private static void writeText(File file, String text) throws Exception {
    try (FileOutputStream out = new FileOutputStream(file)) {
      out.write(text.getBytes(StandardCharsets.UTF_8));
      out.getFD().sync();
    }
  }

  @PluginMethod
  public void load(PluginCall call) {
    File file = dataFile();
    File backup = new File(file.getPath() + ".bak");
    JSObject result = new JSObject();
    boolean hasMain = file.exists();
    boolean hasBackup = backup.exists();
    if (!hasMain && !hasBackup) {
      result.put("text", JSONObject.NULL);
      result.put("notice", JSONObject.NULL);
      call.resolve(result);
      return;
    }
    String mainText = hasMain ? readValidJson(file) : null;
    if (mainText != null) {
      result.put("text", mainText);
      result.put("notice", JSONObject.NULL);
      call.resolve(result);
      return;
    }
    String keptAs = null;
    if (hasMain) {
      File damaged = new File(file.getParentFile(), "gotrack-data.damaged-" + System.currentTimeMillis() + ".json");
      if (file.renameTo(damaged)) keptAs = damaged.getPath();
    }
    String backupText = hasBackup ? readValidJson(backup) : null;
    if (backupText != null) {
      result.put("text", backupText);
      result.put("notice", "backup");
    } else {
      result.put("text", JSONObject.NULL);
      result.put("notice", "corrupt");
      if (keptAs != null) result.put("keptAs", keptAs);
    }
    call.resolve(result);
  }

  @PluginMethod
  public void save(PluginCall call) {
    String text = call.getString("text");
    if (text == null || text.length() > MAX_BYTES) {
      call.reject("Invalid data.");
      return;
    }
    try {
      new JSONObject(text);
      File file = dataFile();
      File tmp = new File(file.getPath() + ".tmp");
      writeText(tmp, text);
      if (file.exists()) {
        try {
          File backup = new File(file.getPath() + ".bak");
          if (backup.exists()) backup.delete();
          // Kopie des bisherigen Stands als Sicherung
          try (FileInputStream in = new FileInputStream(file); FileOutputStream out = new FileOutputStream(backup)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
          }
        } catch (Exception ignored) {
          // Sicherung ist nur ein Extra
        }
      }
      if (!tmp.renameTo(file)) {
        writeText(file, text);
        tmp.delete();
      }
      call.resolve();
    } catch (Exception e) {
      call.reject("Save failed: " + e.getMessage());
    }
  }

  @PluginMethod
  public void exportFile(PluginCall call) {
    String text = call.getString("text");
    String name = call.getString("name", "gotrack.json");
    if (text == null || text.length() > MAX_BYTES) {
      call.reject("Invalid data.");
      return;
    }
    name = name.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", "_");
    if (name.trim().isEmpty()) name = "gotrack.json";
    try {
      ContentResolver resolver = getContext().getContentResolver();
      ContentValues values = new ContentValues();
      values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
      values.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
      values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + EXPORT_FOLDER);
      Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
      if (uri == null) {
        call.reject("Could not create the file in Downloads.");
        return;
      }
      try (OutputStream out = resolver.openOutputStream(uri)) {
        if (out == null) {
          call.reject("Could not open the file for writing.");
          return;
        }
        out.write(text.getBytes(StandardCharsets.UTF_8));
      }
      JSObject result = new JSObject();
      result.put("path", "Downloads/" + EXPORT_FOLDER + "/" + name);
      call.resolve(result);
    } catch (Exception e) {
      call.reject("Export failed: " + e.getMessage());
    }
  }

  @PluginMethod
  public void info(PluginCall call) {
    JSObject result = new JSObject();
    String version = "";
    try {
      PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
      version = pi.versionName == null ? "" : pi.versionName;
    } catch (Exception ignored) {
      // Version ist nur eine Anzeige
    }
    result.put("version", version);
    result.put("dataPath", "App storage (private)");
    call.resolve(result);
  }
}
