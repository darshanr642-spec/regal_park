import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";
import { uploadFile } from "./api";

const MAX_WIDTH = 1280;
const COMPRESS_QUALITY = 0.6;

async function appendToForm(form: FormData, uri: string, name: string, mime: string) {
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type: mime } as any);
  }
}

/**
 * Picks an image, compresses it (JPEG ≤1280px), uploads it to GridFS storage
 * and returns the server path "/api/files/{id}" — or null if cancelled.
 */
export async function pickImage(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1, // we'll do our own compression
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];

  let localUri = asset.uri;
  try {
    const out = await manipulateAsync(
      asset.uri,
      [{ resize: { width: MAX_WIDTH } }],
      { compress: COMPRESS_QUALITY, format: SaveFormat.JPEG },
    );
    localUri = out.uri;
  } catch {
    // Fallback: upload original if the manipulator fails (occasional web issues)
  }

  const form = new FormData();
  await appendToForm(form, localUri, `photo-${Date.now()}.jpg`, "image/jpeg");
  const { url } = await uploadFile(form);
  return url;
}

/**
 * Picks any document, uploads it to GridFS storage and returns
 * { url: "/api/files/{id}", name, mime } — or null if cancelled.
 */
export async function pickDocument(): Promise<{ url: string; name: string; mime: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true, type: "*/*" });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const mime = asset.mimeType || "application/octet-stream";
  const name = asset.name || "document";

  const form = new FormData();
  await appendToForm(form, asset.uri, name, mime);
  const { url } = await uploadFile(form);
  return { url, name, mime };
}
