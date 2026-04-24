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

// ─── INICIALIZACIÓN ──────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Solo inputs de tipo FILE con la clase input-acumulador
  document
    .querySelectorAll("input[type='file'].input-acumulador")
    .forEach((input) => {
      const fieldName = input.name;
      if (!storageArchivos[fieldName]) storageArchivos[fieldName] = [];

      // Aseguramos que el contenedor de lista exista
      let container = document.getElementById(`list-${fieldName}`);
      if (!container) {
        console.warn(
          `⚠️ No se encontró el div con id "list-${fieldName}". Se creará automáticamente.`,
        );
        container = document.createElement("div");
        container.id = `list-${fieldName}`;
        container.className = "file-list-container mt-2";
        input.insertAdjacentElement("afterend", container);
      }

      input.addEventListener("change", function (e) {
        const filesSelected = Array.from(e.target.files);
        const maxPermitido = limitesConfig[fieldName] || 1;

        filesSelected.forEach((file) => {
          // Validar formato PDF
          if (file.type !== "application/pdf") {
            Swal.fire({
              icon: "error",
              title: "Formato no permitido",
              text: `"${file.name}" no es un PDF. Por favor sube solo archivos PDF.`,
            });
            return;
          }

          // Validar peso
          if (file.size > MAX_SIZE_BYTES) {
            const pesoEnMB = (file.size / (1024 * 1024)).toFixed(2);
            Swal.fire({
              icon: "error",
              title: "Archivo muy pesado",
              text: `"${file.name}" pesa ${pesoEnMB} MB. El máximo permitido es ${MAX_SIZE_MB} MB.`,
            });
            return;
          }

          // Validar cantidad máxima
          if (storageArchivos[fieldName].length >= maxPermitido) {
            Swal.fire({
              icon: "warning",
              title: "Límite alcanzado",
              text: `Solo se permiten ${maxPermitido} archivo(s) para este campo.`,
            });
            return;
          }

          // Evitar duplicados
          const yaExiste = storageArchivos[fieldName].some(
            (f) => f.name === file.name,
          );
          if (yaExiste) {
            Swal.fire({
              icon: "info",
              title: "Archivo duplicado",
              text: `"${file.name}" ya fue agregado.`,
            });
            return;
          }

          // Agregar al storage y mostrar en la lista
          storageArchivos[fieldName].push(file);
          const pesoFinal = (file.size / (1024 * 1024)).toFixed(2);
          const item = document.createElement("div");
          item.style.cssText =
            "display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; padding:8px; background:#d4edda; border:1px solid #c3e6cb; border-radius:5px; color:#155724;";
          item.innerHTML = `
          <span><i class="bi bi-check-circle-fill"></i> ${file.name} (${pesoFinal} MB)</span>
          <i class="bi bi-trash3 text-danger" style="cursor:pointer" onclick="quitarArchivo('${fieldName}', '${file.name}', this)"></i>
        `;
          container.appendChild(item);
        });

        input.value = ""; // Reset para permitir volver a seleccionar el mismo archivo
      });
    });

  // ─── SUBMIT ───────────────────────────────────────────────────────────────
  const form = document.getElementById("formularioRegistro");
  if (!form) {
    console.error(
      "❌ No se encontró el formulario con id 'formularioRegistro'",
    );
    return;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    // Validar campos de archivo requeridos manualmente
    const camposRequeridos = [];
    for (const campo of camposRequeridos) {
      if (!storageArchivos[campo] || storageArchivos[campo].length === 0) {
        const label =
          document
            .querySelector(`input[name="${campo}"]`)
            ?.closest(".col-md-6, .col-md-12")
            ?.querySelector("label")?.innerText || campo;
        Swal.fire({
          icon: "error",
          title: "Campo requerido",
          text: `Debes adjuntar el archivo para: "${label.trim()}"`,
        });
        return; // Detiene el envío y muestra el error
      }
    }

    // Construir FormData con los archivos acumulados
    const formData = new FormData(this);
    for (const fieldName in storageArchivos) {
      formData.delete(fieldName);
      storageArchivos[fieldName].forEach((file) => {
        formData.append(fieldName, file);
      });
    }

    ejecutarEnvio(formData);
  });
});

// ─── QUITAR ARCHIVO ──────────────────────────────────────────────────────────
window.quitarArchivo = function (fieldName, fileName, element) {
  storageArchivos[fieldName] = storageArchivos[fieldName].filter(
    (f) => f.name !== fileName,
  );
  element.parentElement.remove();
};

// ─── ENVÍO CON PROGRESO ──────────────────────────────────────────────────────
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
      xhr.timeout = 50000;

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
        } catch (err) {
          Swal.fire(
            "Error",
            "El servidor respondió de forma inesperada.",
            "error",
          );
        }
      };

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
          if (result.isConfirmed) ejecutarEnvio(formData);
        });
      };

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

// ─── NOTIFICACIONES EN SEGUNDO PLANO ─────────────────────────────────────────
async function dispararNotificaciones(id) {
  try {
    console.log(`🔔 Iniciando notificaciones para ID: ${id}`);
    const response = await fetch("/api/notificarRegistro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await response.json();
    console.log("✅ Resultado notificación:", data.message);
  } catch (e) {
    console.error("❌ Error enviando correos:", e);
  }
}
