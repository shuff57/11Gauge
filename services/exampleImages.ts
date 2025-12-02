import type { ExampleImageLabel, ExampleImageSummary } from "../types";

const imageCache = new Map<string, string>();

const cacheImageUrl = (id: string, url: string) => {
  const existing = imageCache.get(id);
  if (existing) {
    URL.revokeObjectURL(existing);
  }
  imageCache.set(id, url);
};

export const invalidateExampleImageCache = (id?: string) => {
  if (id) {
    const existing = imageCache.get(id);
    if (existing) {
      URL.revokeObjectURL(existing);
      imageCache.delete(id);
    }
    return;
  }
  for (const value of imageCache.values()) {
    URL.revokeObjectURL(value);
  }
  imageCache.clear();
};

export const getCachedExampleImageUrl = async (id: string, remoteUrl: string): Promise<string> => {
  if (imageCache.has(id)) {
    return imageCache.get(id)!;
  }
  const response = await fetch(remoteUrl, { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Unable to load example image.');
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  cacheImageUrl(id, objectUrl);
  return objectUrl;
};

export const fetchExampleImages = async (label?: ExampleImageLabel): Promise<ExampleImageSummary[]> => {
  const url = label ? `/api/examples?label=${label}` : '/api/examples';
  const response = await fetch(url, { credentials: 'include' });
  if (response.status === 401) {
    throw new Error('Sign in to view example images.');
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to load example images.');
  }
  return Array.isArray(payload?.images) ? payload.images : [];
};

export interface ExampleImageUploadInput {
  label: ExampleImageLabel;
  title?: string;
  description?: string;
  materialType?: string;
  weldProcess?: string;
  materialThickness?: string;
  jointType?: string;
  weldPosition?: string;
  aiDescription?: string;
}

export const uploadExampleImage = async (
  file: File,
  input: ExampleImageUploadInput
): Promise<ExampleImageSummary> => {
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    throw new Error('Only image or video uploads are supported.');
  }
  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('label', input.label);
  if (input.title) {
    formData.append('title', input.title);
  }
  if (input.description) {
    formData.append('description', input.description);
  }
  if (input.materialType) formData.append('materialType', input.materialType);
  if (input.weldProcess) formData.append('weldProcess', input.weldProcess);
  if (input.materialThickness) formData.append('materialThickness', input.materialThickness);
  if (input.jointType) formData.append('jointType', input.jointType);
  if (input.weldPosition) formData.append('weldPosition', input.weldPosition);
  if (input.aiDescription) formData.append('aiDescription', input.aiDescription);

  const response = await fetch('/api/examples', {
    method: 'POST',
    body: formData,
    credentials: 'include'
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to upload example image.');
  }
  if (!payload?.image) {
    throw new Error('Malformed example image response.');
  }
  return payload.image as ExampleImageSummary;
};

export const deleteExampleImage = async (id: string): Promise<void> => {
  const response = await fetch(`/api/examples/${id}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to delete example image.');
  }
  invalidateExampleImageCache(id);
};
