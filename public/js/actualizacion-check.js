const URL_BASEDEV = window.location.origin || "http://localhost:8081";
const URL_BASEDEPRD = window.location.origin || "http://3.133.217.145:8081";
const PORT = "8081"; // Si usas HTTPS estándar, el puerto va vacío o integrado en la URL
const isLocal = window.location.hostname === "localhost";

const BASE_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:8081"
    : "https://saw.woden.com.co/api-backend"; // Un alias en tu servidor
//Ajustes
(function () {
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  // ✅ En producción usa el alias del proxy, nunca IP:puerto directo
  const BASE_URL = isLocal
    ? "http://localhost:8081"
    : "https://saw.woden.com.co/api-backend";

  let versionServidor = null;
  let chequeoActivo = true;
  const INTERVALO = 10000;

  async function obtenerVersion() {
    try {
      const res = await fetch(`${BASE_URL}/api/check-version`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      return data.version || null;
    } catch (e) {
      console.warn("⚠️ No se pudo obtener la versión del servidor:", e.message);
      return null;
    }
  }

  async function obtenerMantenimiento() {
    try {
      const res = await fetch(`${BASE_URL}/api/check-mantenimiento`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn("⚠️ No se pudo obtener estado de mantenimiento.");
      return null;
    }
  }

  async function iniciarChequeo() {
    versionServidor = await obtenerVersion();
    console.log("🚀 Versión inicial detectada:", versionServidor);

    const avisoInicial = await obtenerMantenimiento();
    if (avisoInicial) actualizarBannerVue(avisoInicial);

    setInterval(async () => {
      const aviso = await obtenerMantenimiento();
      actualizarBannerVue(aviso);

      if (chequeoActivo) {
        const nuevaVersion = await obtenerVersion();
        if (
          nuevaVersion &&
          versionServidor &&
          nuevaVersion !== versionServidor
        ) {
          chequeoActivo = false;
          mostrarAlertaActualizacion();
        }
      }
    }, INTERVALO);
  }

  function actualizarBannerVue(data) {
    if (!data) return;
    const app = window.app || window.vApp || window.__VUE_ROOT_INSTANCIA__;
    if (app && app.avisoGlobal !== undefined) {
      app.avisoGlobal = data;
    } else {
      const el = document.getElementById("app");
      if (el && el.__vue_app__) {
        el.__vue_app__.config.globalProperties.avisoGlobal = data;
      }
    }
  }

  function mostrarAlertaActualizacion() {
    if (typeof Swal === "undefined") {
      if (confirm("Hay una nueva versión disponible. ¿Deseas actualizar?")) {
        location.reload();
      }
      return;
    }
    Swal.fire({
      title: "¡ACTUALIZACIÓN DISPONIBLE!",
      text: "El sistema se ha actualizado para mejorar tu experiencia.",
      icon: "info",
      showConfirmButton: true,
      confirmButtonText: "Actualizar Ahora",
      confirmButtonColor: "rgb(116, 51, 221)",
      allowOutsideClick: false,
      allowEscapeKey: false,
      backdrop: `rgba(0,0,123,0.4)`,
    }).then((result) => {
      if (result.isConfirmed) {
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload(true);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", iniciarChequeo);
})();
