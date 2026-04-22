// Objeto global para guardar los archivos
// const storageArchivos = {};

// Función para disparar las notificaciones en segundo plano
async function dispararNotificaciones(id) {
  try {
    console.log(`🔔 Iniciando notificaciones para ID: ${id}`);

    // Llamada al endpoint que creaste
    // Nota: Asegúrate de que la URL coincida con tu ruta de backend
    const response = await fetch("/api/notificarRegistro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id }),
    });

    const data = await response.json();
    console.log("✅ Resultado notificación:", data.message);
  } catch (e) {
    console.error("❌ Error enviando correos:", e);
  }
}

// // 1. Definimos los límites exactos de tu backend
// const limitesConfig = {
//   cedula: 1,
//   estudios: 5,
//   laborales: 5,
//   cesantias: 1,
//   cuenta: 1,
//   epsDocs: 2,
//   referencias: 5,
//   agenteCampo: 5,
//   hv: 1,
//   habeas: 1,
//   consentimiento: 1,
//   historialLaboral: 5,
// };

// Objeto global para guardar los archivos
const storageArchivos = {};

const limitesConfig = {
  cedula: 1,
  estudios: 5,
  laborales: 5,
  cesantias: 1,
  cuenta: 1,
  epsDocs: 2,
  referencias: 5,
  agenteCampo: 5,
  hv: 1,
  habeas: 1,
  consentimiento: 1,
  historialLaboral: 5,
};

const MAX_SIZE_MB = 5;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

// USAMOS DOMContentLoaded para asegurar que el HTML ya cargó
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".input-acumulador").forEach((input) => {
    const fieldName = input.name;
    if (!storageArchivos[fieldName]) storageArchivos[fieldName] = [];

    input.addEventListener("change", function (e) {
      const filesSelected = Array.from(e.target.files);
      const container = document.getElementById(`list-${fieldName}`);
      const maxPermitido = limitesConfig[fieldName] || 1;

      if (!container) {
        console.error(`Falta el div con id: list-${fieldName}`);
        return;
      }

      filesSelected.forEach((file) => {
        // 1. VALIDACIÓN DE PESO INSTANTÁNEA
        if (file.size > MAX_SIZE_BYTES) {
          const pesoEnMB = (file.size / (1024 * 1024)).toFixed(2);
          Swal.fire({
            icon: "error",
            title: "Archivo muy pesado",
            text: `El archivo "${file.name}" pesa ${pesoEnMB} MB. El máximo es ${MAX_SIZE_MB} MB.`,
          });
          return;
        }

        // 2. VALIDACIÓN DE CANTIDAD
        if (storageArchivos[fieldName].length >= maxPermitido) {
          Swal.fire({
            icon: "warning",
            title: "Límite alcanzado",
            text: `Solo se permiten ${maxPermitido} archivos para este campo.`,
          });
          return;
        }

        // 3. EVITAR DUPLICADOS
        const yaExiste = storageArchivos[fieldName].some(
          (f) => f.name === file.name,
        );

        if (!yaExiste) {
          storageArchivos[fieldName].push(file);

          // Visualización con éxito (Verde)
          const pesoFinal = (file.size / (1024 * 1024)).toFixed(2);
          const item = document.createElement("div");
          item.style =
            "display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; padding: 8px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 5px; color: #155724;";
          item.innerHTML = `
                        <span><i class="bi bi-check-circle-fill"></i> ${file.name} (${pesoFinal} MB)</span>
                        <i class="bi bi-trash3 text-danger" style="cursor:pointer" onclick="quitarArchivo('${fieldName}', '${file.name}', this)"></i>
                    `;
          container.appendChild(item);
        }
      });
      input.value = ""; // Reset del input
    });
  });
});

// La función quitarArchivo debe ser global (fuera del DOMContentLoaded)
window.quitarArchivo = function (fieldName, fileName, element) {
  storageArchivos[fieldName] = storageArchivos[fieldName].filter(
    (f) => f.name !== fileName,
  );
  element.parentElement.remove();
};

// Manejo del SUBMIT
// Manejo del SUBMIT (Modificado)
// Función para disparar las notificaciones en segundo plano
async function dispararNotificaciones(id) {
  try {
    console.log(`🔔 Iniciando notificaciones para ID: ${id}`);

    // Llamada al endpoint que creaste
    // Nota: Asegúrate de que la URL coincida con tu ruta de backend
    const response = await fetch("/api/notificarRegistro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id }),
    });

    const data = await response.json();
    console.log("✅ Resultado notificación:", data.message);
  } catch (e) {
    console.error("❌ Error enviando correos:", e);
  }
}

// Manejo del SUBMIT (Modificado)
document
  .getElementById("formularioRegistro")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    // 1. Preparar el FormData con los archivos del storage global
    const formData = new FormData(this);
    for (const fieldName in storageArchivos) {
      formData.delete(fieldName);
      storageArchivos[fieldName].forEach((file) => {
        formData.append(fieldName, file);
      });
    }

    // 2. Llamar a la función de envío (la separamos para poder reintentar)
    ejecutarEnvio(formData);
  });

function ejecutarEnvio(formData) {
  Swal.fire({
    title: "Subiendo documentos...",
    html: `
            <p id="progress-text">Iniciando subida... 0%</p>
            <div class="progress" style="height: 20px;">
                <div id="progress-bar" class="progress-bar progress-bar-striped progress-bar-animated" 
                     role="progressbar" style="width: 0%; transition: width 0.3s ease;">0%</div>
            </div>
            <p style="margin-top:10px; font-size: 0.8rem; color: #666;">Por favor, no cierres esta ventana.</p>
        `,
    allowOutsideClick: false,
    showConfirmButton: false,
    didOpen: () => {
      const xhr = new XMLHttpRequest();

      // ROBUSTEZ: Definimos un tiempo límite (ej: 50 segundos)
      // Si en este tiempo no termina, se dispara 'ontimeout'
      xhr.timeout = 50000;

      // Rastrear el progreso
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const porcentaje = Math.round((event.loaded * 100) / event.total);
          const progressBar = document.getElementById("progress-bar");
          const progressText = document.getElementById("progress-text");

          if (progressBar) {
            progressBar.style.width = porcentaje + "%";
            progressBar.innerText = porcentaje + "%";
          }
          if (progressText) {
            progressText.innerText = `Enviando documentos... ${porcentaje}%`;
          }
        }
      });

      // Manejar respuesta exitosa o error de servidor
      xhr.onload = function () {
        try {
          const response = JSON.parse(xhr.responseText);
          if (
            xhr.status >= 200 &&
            xhr.status < 300 &&
            response.status === "ok"
          ) {
            if (response.id) dispararNotificaciones(response.id);
            Swal.fire({
              icon: "success",
              title: "¡Registro Exitoso!",
              text: "Tus datos y documentos se han guardado correctamente.",
            }).then(() => window.location.reload());
          } else {
            Swal.fire({
              icon: "error",
              title: "Ups! Algo salió mal",
              text: response.message || "Error inesperado en el servidor.",
            });
          }
        } catch (e) {
          Swal.fire(
            "Error",
            "El servidor respondió de forma inesperada.",
            "error",
          );
        }
      };

      // MANEJO DE TIEMPO AGOTADO (Lo que pediste)
      xhr.ontimeout = function () {
        Swal.fire({
          icon: "warning",
          title: "Está tardando demasiado",
          text: "Tu conexión parece inestable. ¿Deseas intentar el envío nuevamente?",
          showCancelButton: true,
          confirmButtonText: "Sí, reintentar",
          cancelButtonText: "No, cancelar",
          confirmButtonColor: "#3085d6",
          cancelButtonColor: "#d33",
        }).then((result) => {
          if (result.isConfirmed) {
            ejecutarEnvio(formData); // Reintento manual
          }
        });
      };

      // Manejar errores de red
      xhr.onerror = function () {
        Swal.fire({
          icon: "error",
          title: "Error de red",
          text: "No hemos podido registrarte. Verifica tu conexión a internet.",
          footer:
            "<b>Sugerencia:</b> Los archivos grandes en redes lentas pueden causar esto.",
        });
      };

      xhr.open("POST", "/api/enviar");
      xhr.send(formData);
    },
  });
}
