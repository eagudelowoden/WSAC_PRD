/* ═══════════════════════════════════════════════════════════
   WSAC · NAVBAR COMPARTIDO (app shell)
   Un único componente de navegación para TODAS las vistas.
   - Se pinta una sola vez y persiste con Turbo (data-turbo-permanent)
   - Lee sesión y permisos desde la API (no depende del Vue de cada página)
   - Marca el módulo activo según la URL
   Requiere: <nav id="wsac-topnav" data-turbo-permanent></nav> antes de #app
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  // Turbo solo se usa para la navegación entre módulos (links con data-turbo="true").
  // Desactivamos el "drive" global para no interferir con formularios ni el resto de la app.
  try { if (window.Turbo && window.Turbo.session) window.Turbo.session.drive = false; } catch (e) {}

  // Catálogo de módulos: orden, ruta, permiso, icono y etiqueta.
  var MODULOS = [
    { key: "seleccion",     ruta: "/panel-administrativo", perm: "modulo_seleccion",     icon: "bi-people",             label: "Colaboradores" },
    { key: "nomina",        ruta: "/panel-aprobacionesDos", perm: "modulo_nomina",        icon: "bi-cash-stack",         label: "Nómina" },
    { key: "postulaciones", ruta: "/postulaciones",         perm: "modulo_postulaciones", icon: "bi-file-earmark-text",  label: "Postulaciones" },
    { key: "requisiciones", ruta: "/requisiciones",         perm: "modulo_requisiciones", icon: "bi-clipboard2-check",   label: "Requisiciones" },
  ];
  // Rutas que pertenecen a un módulo aunque su path sea distinto
  var ALIAS = { "/agendamientos": "seleccion" };

  var estado = { usuario: null, modulos: null, cargado: false };

  function moduloActivo() {
    var p = window.location.pathname.replace(/\/+$/, "") || "/";
    for (var i = 0; i < MODULOS.length; i++) {
      if (p === MODULOS[i].ruta || p.indexOf(MODULOS[i].ruta) === 0) return MODULOS[i].key;
    }
    if (ALIAS[p]) return ALIAS[p];
    if (p.indexOf("/superadmin") === 0) return "superadmin";
    return null;
  }

  function iniciales(nombre) {
    if (!nombre) return "?";
    var partes = nombre.trim().split(/\s+/);
    return (partes[0][0] + (partes[1] ? partes[1][0] : "")).toUpperCase();
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // Construye la lista de módulos permitidos para el usuario actual.
  function modulosVisibles() {
    var m = estado.modulos || {};
    var lista = MODULOS.filter(function (x) { return m[x.perm]; });
    var esSuper = estado.usuario && estado.usuario.rol === "superadmin";
    return { lista: lista, superadmin: esSuper };
  }

  function pintar() {
    var nav = document.getElementById("wsac-topnav");
    if (!nav) return;

    var activo = moduloActivo();
    var vis = modulosVisibles();
    var actual = MODULOS.filter(function (x) { return x.key === activo; })[0];
    var subtitulo = actual ? actual.label : (activo === "superadmin" ? "Super Admin" : "Panel");
    var u = estado.usuario;

    var itemsHtml = vis.lista.map(function (x) {
      var act = x.key === activo ? " active" : "";
      var check = x.key === activo ? '<i class="bi bi-check2 opciones-check"></i>' : "";
      return '<a href="' + x.ruta + '" data-turbo="true" class="opciones-item' + act + '">' +
             '<i class="bi ' + x.icon + '"></i><span>' + esc(x.label) + "</span>" + check + "</a>";
    }).join("");

    if (vis.superadmin) {
      var actSA = activo === "superadmin" ? " active" : "";
      itemsHtml += '<div class="opciones-sep"></div>' +
        '<a href="/superadmin" data-turbo="true" class="opciones-item' + actSA + '">' +
        '<i class="bi bi-shield-lock"></i><span>Super Admin</span>' +
        (activo === "superadmin" ? '<i class="bi bi-check2 opciones-check"></i>' : "") + "</a>";
    }

    nav.innerHTML =
      '<div class="wsac-nav-left">' +
        '<span class="navbar-brand mb-0 d-flex align-items-center gap-2">' +
          '<i class="bi bi-building-gear fs-6"></i>' +
          '<span class="wsac-nav-brand">Woden · Capital Humano</span>' +
        "</span>" +
        '<div class="wsac-nav-modules">' +
          '<div class="opciones-wrap">' +
            '<button class="btn-opciones" type="button" data-wsac="toggle-opciones">' +
              '<i class="bi bi-grid-3x3-gap-fill"></i>' +
              '<span class="d-none d-sm-inline">Opciones</span>' +
              '<i class="bi bi-chevron-down chev"></i>' +
            "</button>" +
            '<div class="opciones-menu" data-wsac="menu-opciones" hidden>' +
              '<div class="opciones-title">Módulos disponibles</div>' +
              (itemsHtml || '<div class="opciones-title" style="text-transform:none">Sin módulos asignados</div>') +
            "</div>" +
          "</div>" +
          '<span class="wsac-nav-sub d-none d-md-inline">' + esc(subtitulo) + "</span>" +
        "</div>" +
      "</div>" +
      '<div class="wsac-nav-right">' +
        '<button class="wsac-user" type="button" data-wsac="toggle-user">' +
          '<span class="wsac-user-avatar">' + esc(iniciales(u && u.nombre)) + "</span>" +
          '<span class="wsac-user-name d-none d-md-inline">' + esc(u && u.nombre ? u.nombre : "Usuario") + "</span>" +
          '<i class="bi bi-chevron-down x-small"></i>' +
        "</button>" +
        '<div class="wsac-user-menu" data-wsac="user-menu" hidden>' +
          '<button class="wsac-user-item danger" data-wsac="logout"><i class="bi bi-box-arrow-right"></i> Cerrar sesión</button>' +
        "</div>" +
      "</div>" +
      '<div class="opciones-backdrop" data-wsac="backdrop" hidden></div>';

    conectar(nav);
  }

  function cerrarTodo(nav) {
    ["menu-opciones", "user-menu", "backdrop"].forEach(function (k) {
      var el = nav.querySelector('[data-wsac="' + k + '"]');
      if (el) el.hidden = true;
    });
    var btn = nav.querySelector('[data-wsac="toggle-opciones"]');
    if (btn) btn.classList.remove("open");
  }

  function conectar(nav) {
    var menu = nav.querySelector('[data-wsac="menu-opciones"]');
    var btnOp = nav.querySelector('[data-wsac="toggle-opciones"]');
    var userMenu = nav.querySelector('[data-wsac="user-menu"]');
    var btnUser = nav.querySelector('[data-wsac="toggle-user"]');
    var backdrop = nav.querySelector('[data-wsac="backdrop"]');

    btnOp.addEventListener("click", function (e) {
      e.stopPropagation();
      var abrir = menu.hidden;
      cerrarTodo(nav);
      menu.hidden = !abrir;
      backdrop.hidden = !abrir;
      btnOp.classList.toggle("open", abrir);
    });
    btnUser.addEventListener("click", function (e) {
      e.stopPropagation();
      var abrir = userMenu.hidden;
      cerrarTodo(nav);
      userMenu.hidden = !abrir;
      backdrop.hidden = !abrir;
    });
    backdrop.addEventListener("click", function () { cerrarTodo(nav); });

    nav.querySelector('[data-wsac="logout"]').addEventListener("click", async function () {
      try { await fetch("/api/logout", { method: "POST", credentials: "same-origin" }); } catch (e) {}
      try { localStorage.removeItem("usuario"); } catch (e) {}
      window.location.href = "/login.html";
    });
  }

  // Solo actualiza el resaltado activo (al navegar con Turbo el nav ya existe)
  function actualizarActivo() {
    var nav = document.getElementById("wsac-topnav");
    if (!nav || !estado.cargado) return;
    pintar();
  }

  async function cargar() {
    try {
      var rs = await fetch("/api/session/actual", { credentials: "same-origin" });
      if (rs.ok) { var d = await rs.json(); estado.usuario = d.usuario || d; }
    } catch (e) {}
    try {
      var rm = await fetch("/api/mis-modulos", { credentials: "same-origin" });
      if (rm.ok) estado.modulos = await rm.json();
    } catch (e) {}
    estado.cargado = true;
    pintar();
  }

  function init() {
    var nav = document.getElementById("wsac-topnav");
    if (!nav) return;
    if (estado.cargado) { pintar(); } else { cargar(); }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  // Turbo: al cambiar de vista, el nav persiste; solo refrescamos el activo.
  document.addEventListener("turbo:load", actualizarActivo);
})();
