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

// Inicializar los campos que tienen la clase 'input-acumulador'
document.querySelectorAll(".input-acumulador").forEach((input) => {
  const fieldName = input.name;
  storageArchivos[fieldName] = [];

  input.addEventListener("change", function (e) {
    // Convertimos la lista de archivos actual en un Array
    const filesSelected = Array.from(e.target.files);
    const container = document.getElementById(`list-${fieldName}`);

    if (!container) {
      console.error(
        `Error: No existe un div con id "list-${fieldName}" para mostrar los archivos.`,
      );
      return;
    }

    filesSelected.forEach((file) => {
      // Evitar duplicados por nombre y tamaño
      const yaExiste = storageArchivos[fieldName].some(
        (f) => f.name === file.name && f.size === file.size,
      );

      if (!yaExiste) {
        storageArchivos[fieldName].push(file);

        // Crear visualización
        const item = document.createElement("div");
        item.className = "file-item";
        item.style.display = "flex";
        item.style.justifyContent = "space-between";
        item.style.marginBottom = "5px";
        item.style.padding = "8px";
        item.style.background = "#f0f2f5";
        item.style.borderRadius = "5px";

        item.innerHTML = `
                    <span><i class="bi bi-file-earmark-check"></i> ${file.name}</span>
                    <i class="bi bi-x-circle-fill text-danger" style="cursor:pointer" onclick="quitarArchivo('${fieldName}', '${file.name}', this)"></i>
                `;
        container.appendChild(item);
      }
    });

    // IMPORTANTE: Esto limpia el input visualmente para que
    // NO se reemplacen en la siguiente selección.
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
document
  .getElementById("formularioRegistro")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const formData = new FormData(this);

    // Acumular archivos
    for (const fieldName in storageArchivos) {
      formData.delete(fieldName);
      storageArchivos[fieldName].forEach((file) => {
        formData.append(fieldName, file);
      });
    }

    try {
      Swal.fire({
        title: "Enviando...",
        text: "Subiendo documentos y registrando colaborador...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const response = await fetch("/api/enviar", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok && data.status === "ok") {
        // --- AQUÍ ACTIVAMOS LA NOTIFICACIÓN ---
        // Usamos el ID que el backend debería retornar al crear el usuario
        if (data.id) {
          dispararNotificaciones(data.id);
        } else {
          console.warn("⚠️ No se recibió ID para notificar");
        }

        Swal.fire(
          "¡Éxito!",
          "Registro completado y equipo de nómina notificado.",
          "success",
        ).then(() => {
          window.location.reload();
        });
      } else {
        throw new Error(data.message || "Error en el servidor");
      }
    } catch (error) {
      Swal.fire("Error", error.message, "error");
    }
  });
