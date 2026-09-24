export type UploadResponseDto = {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  cdnUrl?: string;
  uploadedAt?: string;
};

export type FileUploadInput = {
  filename?: string;
  contentType?: string;
};
