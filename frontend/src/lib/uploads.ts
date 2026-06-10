import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";

const MAX_WIDTH = 1280;
const COMPRESS_QUALITY = 0.6;

/** Returns base64 data URI string or null if cancelled. Compresses to JPEG ≤1280px. */
export async function pickImage(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1, // we'll do our own compression
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  try {
    const out = await manipulateAsync(
      asset.uri,
      [{ resize: { width: MAX_WIDTH } }],
      { compress: COMPRESS_QUALITY, format: SaveFormat.JPEG, base64: true },
    );
    if (out.base64) return `data:image/jpeg;base64,${out.base64}`;
    if (out.uri.startsWith("data:")) return out.uri;
    const b64 = await FileSystem.readAsStringAsync(out.uri, { encoding: FileSystem.EncodingType.Base64 });
    return `data:image/jpeg;base64,${b64}`;
  } catch {
    // Fallback: use original if manipulator fails (web, occasional issues)
    if (asset.uri.startsWith("data:")) return asset.uri;
    if (Platform.OS === "web") return asset.uri;
    const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    return `data:image/jpeg;base64,${b64}`;
  }
}

/** Returns { dataUri, name, mime } or null if cancelled. */
export async function pickDocument(): Promise<{ dataUri: string; name: string; mime: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true, type: "*/*" });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const mime = asset.mimeType || "application/octet-stream";
  let dataUri = asset.uri;
  if (!dataUri.startsWith("data:")) {
    const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    dataUri = `data:${mime};base64,${b64}`;
  }
  return { dataUri, name: asset.name || "document", mime };
}
