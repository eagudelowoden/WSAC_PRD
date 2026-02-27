// Objeto global para guardar los archivos
const storageArchivos = {};

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

// 1. Definimos los límites exactos de tu backend
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

// Inicializar los campos que tienen la clase 'input-acumulador'
document.querySelectorAll(".input-acumulador").forEach((input) => {
  const fieldName = input.name;
  storageArchivos[fieldName] = [];

  input.addEventListener("change", function (e) {
    const filesSelected = Array.from(e.target.files);
    const container = document.getElementById(`list-${fieldName}`);
    
    // Obtenemos el máximo permitido para este campo específico
    const maxPermitido = limitesConfig[fieldName] || 1;

    if (!container) {
      console.error(`Error: No existe un div con id "list-${fieldName}"`);
      return;
    }

    filesSelected.forEach((file) => {
      // --- VALIDACIÓN DE LÍMITE ---
      if (storageArchivos[fieldName].length >= maxPermitido) {
        // Usamos SweetAlert para avisar al usuario
        Swal.fire({
          icon: "warning",
          title: "Límite superado",
          text: `Solo puedes subir un máximo de ${maxPermitido} archivo(s) para "${fieldName}".`,
          confirmButtonColor: "#3085d6",
        });
        return; // Detiene la ejecución para este archivo
      }

      // Evitar duplicados por nombre y tamaño
      const yaExiste = storageArchivos[fieldName].some(
        (f) => f.name === file.name && f.size === file.size
      );

      if (!yaExiste) {
        storageArchivos[fieldName].push(file);

        // Crear visualización
        const item = document.createElement("div");
        item.className = "file-item";
        item.style = "display: flex; justify-content: space-between; margin-bottom: 5px; padding: 8px; background: #f0f2f5; border-radius: 5px;";

        item.innerHTML = `
            <span><i class="bi bi-file-earmark-check"></i> ${file.name}</span>
            <i class="bi bi-x-circle-fill text-danger" style="cursor:pointer" onclick="quitarArchivo('${fieldName}', '${file.name}', this)"></i>
        `;
        container.appendChild(item);
      }
    });

    // Limpia el input para permitir seleccionar el mismo archivo si se borró
    input.value = "";
  });
});

// Función para quitar archivos de la lista
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
document.getElementById("formularioRegistro").addEventListener("submit", async function (e) {
    e.preventDefault();

    const formData = new FormData(this);

    // Acumular archivos del storage global
    for (const fieldName in storageArchivos) {
        formData.delete(fieldName);
        storageArchivos[fieldName].forEach((file) => {
            formData.append(fieldName, file);
        });
    }

    // 1. Mostrar SweetAlert con barra de progreso vacía
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
            // 2. Configurar XMLHttpRequest
            const xhr = new XMLHttpRequest();

            // Rastrear el progreso de la subida
            xhr.upload.addEventListener("progress", (event) => {
                if (event.lengthComputable) {
                    const porcentaje = Math.round((event.loaded * 100) / event.total);
                    
                    // Actualizar la interfaz de SweetAlert
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

            // Manejar la respuesta del servidor
            xhr.onload = function () {
                const response = JSON.parse(xhr.responseText);

                if (xhr.status >= 200 && xhr.status < 300 && response.status === "ok") {
                    // ÉXITO
                    if (response.id) dispararNotificaciones(response.id);

                    Swal.fire({
                        icon: "success",
                        title: "¡Registro Exitoso!",
                        text: "Tus datos y documentos se han guardado correctamente.",
                    }).then(() => window.location.reload());
                } else {
                    // ERROR DEL SERVIDOR (Mensaje amigable)
                    Swal.fire({
                        icon: "error",
                        title: "Ups! Algo salió mal",
                        text: response.message || "Error inesperado en el servidor.",
                    });
                }
            };

            // Manejar errores de red/conexión
            xhr.onerror = function () {
                Swal.fire({
                    icon: "error",
                    title: "Error de red",
                    text: "Ups! No hemos podido registrarte. Por favor intenta de nuevo y verifica que tu conexión a internet sea estable.",
                    footer: "<b>Sugerencia:</b> Los archivos grandes en redes lentas pueden causar esto."
                });
            };

            // Enviar la petición
            xhr.open("POST", "/api/enviar");
            xhr.send(formData);
        }
    });
});