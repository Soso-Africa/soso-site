import type { CloudinaryMediaInspection } from "./cloudinary-storage";

export type MediaInspection = CloudinaryMediaInspection;
export type MediaUpload = {
  uploadURL: string;
  uploadMethod: "POST" | "PUT";
  uploadFields: Record<string, string>;
  uploadHeaders?: Record<string, string>;
  finalizeToken?: string;
  requiresRenditions?: boolean;
  objectPath: string;
};
export type MediaUploadContext = { size: number; ownerId: string };
export type MediaArea = "uploads" | "public";
export type MediaDelivery = { url: string; cacheControl: string };

export interface MediaStorage {
  readonly provider: "cloudinary" | "r2";
  createMediaUpload(name: string, contentType: string, context?: MediaUploadContext): Promise<MediaUpload>;
  inspectUploadedMedia(path: string): Promise<MediaInspection>;
  inspectPublicMedia(path: string): Promise<MediaInspection>;
  readUploadedImageBytes(path: string, maxBytes: number): Promise<Buffer>;
  deleteUploadedMedia(path: string): Promise<void>;
  deleteUnreferencedUploadedMedia?(path: string): Promise<void>;
  runDiagnostic(): Promise<MediaInspection>;
  resolveDelivery(path: string, area: MediaArea, options: { width?: number; allowPrivate: boolean }): Promise<MediaDelivery>;
  verifyFinalization?(objectPath: string, token: string | undefined, ownerId: string): Promise<void>;
  createRenditionUploads?(
    objectPath: string, token: string, ownerId: string,
    renditions: import("@workspace/api-zod").RenditionUploadMetadata[],
  ): Promise<import("@workspace/api-zod").RenditionAuthorizationResponse>;
  finalizeRenditions?(objectPath: string, token: string | undefined, ownerId: string): Promise<void>;
}
