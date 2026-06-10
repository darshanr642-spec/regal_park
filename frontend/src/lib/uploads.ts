import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

/** Returns base64 data URI string or null if cancelled. */
export async function pickImage(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.5,
    base64: Platform.OS !== "web", // web returns data URI in uri already
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  if (asset.uri.startsWith("data:")) return asset.uri;
  if (asset.base64) return `data:image/jpeg;base64,${asset.base64}`;
  // Fallback: read file as base64
  const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:image/jpeg;base64,${b64}`;
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
