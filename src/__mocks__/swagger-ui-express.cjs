const serve = jest.fn((_req, _res, next) => next());
const setup = jest.fn(() => (_req, res, _next) => res.send('docs'));

module.exports = {
  serve,
  setup,
  default: { serve, setup },
};
