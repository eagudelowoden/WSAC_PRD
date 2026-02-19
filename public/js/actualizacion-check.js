(function () {
  let versionServidor = null;
  let chequeoActivo = true; // Candado para no repetir la alerta
  const INTERVALO = 30000;
const URL_BASEDEV = process.env.URL_BASEDEV;
  async function obtenerVersion() {
    try {
      const res = await fetch("http://localhost:8081/api/check-version");
      if (!res.ok) return null;
      const data = await res.json();
      return data.version;
    } catch (e) {
      return null;
    }
  }

  async function iniciarChequeo() {
    versionServidor = await obtenerVersion();

    const timer = setInterval(async () => {
      if (!chequeoActivo) {
        clearInterval(timer); // Detenemos el reloj si ya detectamos cambio
        return;
      }

      const nuevaVersion = await obtenerVersion();

      if (nuevaVersion && versionServidor && nuevaVersion !== versionServidor) {
        chequeoActivo = false; // Bloqueamos futuras revisiones

        // ALERTA FORZOSA
        Swal.fire({
          title: "¡ACTUALIZACIÓN DISPONIBLE!",
          text: "El sistema se ha actualizado. Hemos actualizado el sistema para mejorar tu experiencia.",
          icon: "info",
          showConfirmButton: true,
          confirmButtonText: "Actualizar Ahora",
          confirmButtonColor: "rgb(116, 51, 221)",
          allowOutsideClick: false, // NO se cierra al hacer clic fuera
          allowEscapeKey: false, // NO se cierra con ESC
          allowEnterKey: true,
          backdrop: `rgba(0,0,123,0.4)`, // Oscurece todo el fondo para bloquear la vista
        }).then((result) => {
          if (result.isConfirmed) {
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "/"; // Redirige al login o inicio
          }
        });
      }
    }, INTERVALO);
  }

  document.addEventListener("DOMContentLoaded", iniciarChequeo);
})();
