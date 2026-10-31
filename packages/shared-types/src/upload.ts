export type UploadTicket = {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  cdnUrl?: string | null;
  uploadedAt?: string;
};
