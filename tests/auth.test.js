process.env.JWT_SECRET = process.env.JWT_SECRET || "test_secret_for_jest";

const jwt = require("jsonwebtoken");
const { verificarAuth, verificarSuperAdmin } = require("../middlewares/auth");

function mockRes() {
  const res = {};
  res.statusCode = 200;
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn(() => res);
  res.redirect = jest.fn(() => res);
  res.set = jest.fn(() => res);
  res.clearCookie = jest.fn(() => res);
  return res;
}

describe("verificarAuth", () => {
  test("rechaza peticiones de API sin token con 401", () => {
    const req = { cookies: {}, originalUrl: "/api/usuarios" };
    const res = mockRes();
    const next = jest.fn();

    verificarAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("redirige peticiones de vistas sin token", () => {
    const req = { cookies: {}, originalUrl: "/panel-administrativo" };
    const res = mockRes();
    const next = jest.fn();

    verificarAuth(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining("/login.html"));
    expect(next).not.toHaveBeenCalled();
  });

  test("permite el paso con un token válido y setea req.user", () => {
    const token = jwt.sign({ id: 1, nombre: "Test", rol: "aprobadorUno" }, process.env.JWT_SECRET, { expiresIn: "1h" });
    const req = { cookies: { wsac_token: token }, originalUrl: "/api/usuarios" };
    const res = mockRes();
    const next = jest.fn();

    verificarAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ id: 1, rol: "aprobadorUno" });
  });

  test("rechaza un token inválido y limpia la cookie", () => {
    const req = { cookies: { wsac_token: "token-invalido" }, originalUrl: "/api/usuarios" };
    const res = mockRes();
    const next = jest.fn();

    verificarAuth(req, res, next);

    expect(res.clearCookie).toHaveBeenCalledWith("wsac_token");
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("verificarSuperAdmin", () => {
  test("permite el paso solo si el rol es superadmin", () => {
    const token = jwt.sign({ id: 1, rol: "superadmin" }, process.env.JWT_SECRET, { expiresIn: "1h" });
    const req = { cookies: { wsac_token: token } };
    const res = mockRes();
    const next = jest.fn();

    verificarSuperAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test("redirige si el rol no es superadmin", () => {
    const token = jwt.sign({ id: 1, rol: "jefe" }, process.env.JWT_SECRET, { expiresIn: "1h" });
    const req = { cookies: { wsac_token: token } };
    const res = mockRes();
    const next = jest.fn();

    verificarSuperAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalled();
  });
});
