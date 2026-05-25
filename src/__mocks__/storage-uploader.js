const mockUploadResult = {
  success: true,
  metadata: {
    url: 'https://cloud.appwrite.io/v1/storage/buckets/test/files/test/file',
    filename: 'test.png',
    size: 1024,
    mimeType: 'image/png',
    fileId: 'test-file-id',
  },
};

module.exports = {
  uploadFileToStorage: jest.fn().mockResolvedValue(mockUploadResult.metadata),
  uploadMultipleFiles: jest.fn().mockResolvedValue([mockUploadResult.metadata]),
  deleteFileFromStorage: jest.fn().mockResolvedValue(undefined),
  extractFileIdFromUrl: jest.fn().mockReturnValue('test-file-id'),
  extractFilePathFromUrl: jest.fn().mockReturnValue('test-file-id'),
  cleanupUploadedFiles: jest.fn().mockResolvedValue(undefined),
  uploadFile: jest.fn().mockResolvedValue(mockUploadResult),
  deleteFile: jest.fn().mockResolvedValue({ success: true, error: undefined }),
  getSignedUrl: jest.fn().mockResolvedValue(mockUploadResult),
  listUserFiles: jest.fn().mockResolvedValue({ success: true, files: [], error: undefined }),
};