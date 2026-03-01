(function () {
  let versionServidor = null;
  let chequeoActivo = true;
  const INTERVALO = 7000;

  // --- Funciones de Consulta ---

  async function obtenerVersion() {
    try {
      const res = await fetch("http://localhost:8081/api/check-version");
      const data = await res.json();
      return data.version;
    } catch (e) {
      return null;
    }
  }

  async function obtenerMantenimiento() {
    try {
      const res = await fetch("http://localhost:8081/api/check-mantenimiento");
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  // --- Lógica Principal ---

  async function iniciarChequeo() {
    // Carga inicial
    versionServidor = await obtenerVersion();

    // Chequeo inicial de mantenimiento (por si ya hay uno activo al entrar)
    const avisoInicial = await obtenerMantenimiento();
    actualizarBannerVue(avisoInicial);

    const timer = setInterval(async () => {
      // 1. CHEQUEO DE MANTENIMIENTO (Siempre activo)
      const aviso = await obtenerMantenimiento();
      actualizarBannerVue(aviso);

      // 2. CHEQUEO DE VERSIÓN (Se detiene si detecta cambio)
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

  // Función para inyectar el aviso en tu instancia de Vue
  function actualizarBannerVue(data) {
    if (!data) return;

    // Asumiendo que tu app de Vue está montada en #app y es accesible
    // Si usas Vue 3 y tienes la instancia accesible:
    if (window.app && window.app.avisoGlobal) {
      window.app.avisoGlobal = data;
    } else {
      // Opción B: Si usas una instancia global o el objeto data directamente
      // Esto depende de cómo hayas declarado 'avisoGlobal' en tu script de Vue
      if (typeof vApp !== "undefined") {
        // Ajusta 'vApp' al nombre de tu variable Vue
        vApp.avisoGlobal = data;
      }
    }
  }

  function mostrarAlertaActualizacion() {
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
        window.location.reload(); // reload() es más limpio para actualizar versión
      }
    });
  }

  document.addEventListener("DOMContentLoaded", iniciarChequeo);
})();
