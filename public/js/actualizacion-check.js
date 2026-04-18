const URL_BASEDEV = window.location.origin || "http://localhost:8081";
const URL_BASEDEPRD = window.location.origin || "http://3.133.217.145:8081";
const PORT = "8081"; // Si usas HTTPS estándar, el puerto va vacío o integrado en la URL
const isLocal = window.location.hostname === "localhost";

const BASE_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:8081"
    : "https://saw.woden.com.co/api-backend"; // Un alias en tu servidor

(function () {
  // --- 1. CONFIGURACIÓN DE RUTAS ---
  // Detectamos si es local o producción
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  // IMPORTANTE: Si tu sitio es HTTPS, el API debe ser HTTPS o el navegador lo bloqueará (Mixed Content)
  // Usamos el alias /api-backend que deberías configurar en tu proxy (IIS/Nginx)
  const BASE_URL = isLocal
    ? "http://localhost:8081"
    : "https://saw.woden.com.co/api-backend";

  let versionServidor = null;
  let chequeoActivo = true;
  const INTERVALO = 10000; // 10 segundos para no saturar el servidor

  // --- 2. FUNCIONES DE CONSULTA ---

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

  // --- 3. LÓGICA PRINCIPAL ---

  async function iniciarChequeo() {
    // Carga inicial de versión
    versionServidor = await obtenerVersion();
    console.log("🚀 Versión inicial detectada:", versionServidor);

    // Chequeo inicial de mantenimiento
    const avisoInicial = await obtenerMantenimiento();
    if (avisoInicial) actualizarBannerVue(avisoInicial);

    // Timer cíclico
    setInterval(async () => {
      // A. Chequeo de mantenimiento (siempre activo)
      const aviso = await obtenerMantenimiento();
      actualizarBannerVue(aviso);

      // B. Chequeo de versión (solo si no se ha detectado cambio ya)
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

  // --- 4. INTEGRACIÓN CON VUE ---

  function actualizarBannerVue(data) {
    if (!data) return;

    // Buscamos la instancia de Vue en los objetos globales comunes
    const app = window.app || window.vApp || window.__VUE_ROOT_INSTANCIA__;

    if (app && app.avisoGlobal !== undefined) {
      app.avisoGlobal = data;
    } else {
      // Intento alternativo para Vue 3 si está montado en #app
      const el = document.getElementById("app");
      if (el && el.__vue_app__) {
        el.__vue_app__.config.globalProperties.avisoGlobal = data;
      }
    }
  }

  // --- 5. INTERFAZ DE USUARIO (SWAL) ---

  function mostrarAlertaActualizacion() {
    if (typeof Swal === "undefined") {
      console.error("SweetAlert2 (Swal) no está cargado.");
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
