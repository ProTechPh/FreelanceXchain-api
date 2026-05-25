const multerMock = jest.fn().mockReturnValue({
  single: jest.fn().mockReturnValue((req, res, next) => next ? next() : undefined),
  array: jest.fn().mockReturnValue((req, res, next) => next ? next() : undefined),
  fields: jest.fn().mockReturnValue((req, res, next) => next ? next() : undefined),
  none: jest.fn().mockReturnValue((req, res, next) => next ? next() : undefined),
});

multerMock.memoryStorage = jest.fn().mockReturnValue({
  _handleFile: jest.fn().mockImplementation((req, file, cb) => cb(null, { buffer: Buffer.from('') })),
  _removeFile: jest.fn().mockImplementation((req, file, cb) => cb(null)),
});

multerMock.diskStorage = jest.fn().mockReturnValue({
  _handleFile: jest.fn().mockImplementation((req, file, cb) => cb(null, {})),
  _removeFile: jest.fn().mockImplementation((req, file, cb) => cb(null)),
});

module.exports = multerMock;