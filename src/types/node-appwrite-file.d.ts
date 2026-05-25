declare module 'node-appwrite/file' {
  export class InputFile {
    static fromBuffer(buffer: Buffer, name: string, mimeType?: string): any;
    static fromPath(path: string, mimeType?: string): any;
    static fromBlob(blob: Blob, name: string, mimeType?: string): any;
    static fromStream(stream: any, name: string, mimeType?: string): any;
  }
}